const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });
const admin = require('firebase-admin');
const { Pool } = require('pg');
const socketIo = require('socket.io');
const http = require('http');

//Create express app
const app = express();
const PORT = process.env.PORT || 1000;

//Create HTTP server
const server = http.createServer(app);

//Socket.io Server
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust as needed for security
    methods: ["GET", "POST", "PATCH"]
  }
});
io.on('connection', (socket) => {
  socket.on('disconnect', () => {
  });
});

//Create a pool of connections to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL 
});

// Initialize Firebase Admin SDK (adjust as needed for your setup)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
})

// Middleware
app.use(cors())
app.use(express.json())

// Verify Firebase token middleware
const verifyFirebaseToken = async (req, res, next) => {
  console.log(`--> Middleware: Checking token for: ${req.method} ${req.originalUrl}`); // ADD THIS
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log("--> Middleware: No token provided"); // ADD THIS
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    console.log("--> Middleware: Verifying token..."); // ADD THIS
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    console.log(`--> Middleware: Token valid, UID: ${req.uid}, calling next()`); // ADD THIS
    next(); // Calls next on success
  } catch (err) {
    console.error('--> Middleware Error:', err.message); // ADD THIS + .message for clarity
    res.status(401).json({ error: 'Invalid token' }); // Sends 401 on error
  }
}

//-------------------------------------------GET ENDPOINTS-------------------------------------------

// Route protected by the token middleware
app.get('/api/queue', verifyFirebaseToken, async (req, res) => {
  // For now, you can leave this part empty or return dummy data.
  res.json({ message: 'Queue data would be here', userId: req.uid })
})

//DataBase Routes
//Grab the salesreps data from table
app.get('/api/salesreps', async(req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM salesreps ORDER BY id ASC')
    res.json(result.rows)
  } catch (error) {
    console.error(error)
    res.status(500).json({error:'Failed to fetch sales reps'})
  }
})

//Grab the customers data from table
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM customers
      ORDER BY 
        CASE WHEN status = 'helped' THEN 1 ELSE 0 END,
        created_at ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});


//-------------------------------------------POST ENDPOINTS-------------------------------------------

//new POST to create a new customer and add to database
app.post('/api/customers', async (req, res) => {
  try {
    // Destructure the new customer data from the request body.
    // rep_id can be null initially (customer not assigned to a rep)
    const { rep_id, customer_name, status } = req.body;
    const result = await pool.query(
      `INSERT INTO customers (rep_id, customer_name, status)
       VALUES ($1, $2, $3) RETURNING *`,
      [rep_id || null, customer_name, status || 'waiting']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add customer' });
  }
});

//-------------------------------------------PATCH ENDPOINTS-------------------------------------------

// New PATCH endpoint for the logged-in sales rep
app.patch('/api/salesreps/me', verifyFirebaseToken, async (req, res) => {
  console.log(`--> ROUTE HIT: PATCH /api/salesreps/me - Received UID: ${req.uid}`); // ADD THIS FIRST LINE
  const { status, total_customers } = req.body;
  try {
    console.log(`--> DB Query: Updating salesrep <span class="math-inline">\{req\.uid\} with status\=</span>{status}, total_customers=${total_customers}`); // Optional: Add this too
    const result = await pool.query(
      `UPDATE salesreps
       SET status = COALESCE($1, status),
           total_customers = COALESCE($2, total_customers)
       WHERE firebase_id = $3
       RETURNING *`,
      [status, total_customers, req.uid]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update sales rep' });
  }
});

// PATCH endpoint to update the next waiting customer
app.patch('/api/customers/update/next', verifyFirebaseToken, async (req, res) => {
  try {
    const queryText = `
      UPDATE customers
      SET status = 'being helped',
          rep_id = (
            SELECT id FROM salesreps WHERE firebase_id = $1
          )
      WHERE id = (
        SELECT id FROM customers
        WHERE status = 'waiting'
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING *;
    `;
    const values = [req.uid];
    const result = await pool.query(queryText, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No waiting customer found' });
    }
    const updatedCustomer = result.rows[0];

    io.emit('customerUpdated', updatedCustomer);

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

//Patch endpoint to update the customer status to helped
app.patch('/api/salesreps/finish', verifyFirebaseToken, async (req, res) => {
  try {
    // update the customer being helped to "helped"
    const customerQuery = `
      UPDATE customers
      SET status = 'helped'
      WHERE id = (
        SELECT id FROM customers
        WHERE rep_id = (
          SELECT id FROM salesreps WHERE firebase_id = $1
        )
        AND status = 'being helped'
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING *;
    `;
    const customerValues = [req.uid];
    const customerResult = await pool.query(customerQuery, customerValues);
    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: 'No customer currently being helped found for this rep' });
    }
    
    // Then, update the sales rep: increment total_customers, set status to "available", and record finished_at timestamp
    const repQuery = `
      UPDATE salesreps
      SET total_customers = total_customers + 1,
          status = 'available',
          finished_at = NOW()
      WHERE firebase_id = $1
      RETURNING *;
    `;
    const repValues = [req.uid];
    const repResult = await pool.query(repQuery, repValues);
    
    // emit Socket.IO events
    io.emit('repUpdated', repResult.rows[0]);
    io.emit('customerUpdated', customerResult.rows[0]);
    
    res.json({
      rep: repResult.rows[0],
      finishedCustomer: customerResult.rows[0]
    });
  } catch (error) {
    console.error('Error finishing with customer:', error);
    res.status(500).json({ error: 'Failed to finish with customer' });
  }
});

// PATCH endpoint to reset the sales rep's record
app.patch('/api/salesreps/reset', verifyFirebaseToken, async (req, res) => {
  try {
    const queryText = `
      UPDATE salesreps
      SET total_customers = 0,
          finished_at = NULL,
          status = 'available'
      WHERE firebase_id = $1
      RETURNING *;
    `;
    const values = [req.uid];
    const result = await pool.query(queryText, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error resetting rep:', error);
    res.status(500).json({ error: 'Failed to reset sales rep' });
  }
});


//-------------------------------------------DELETE ENDPOINTS-------------------------------------------

//DELETE endpoint to remove a customer from the database
app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

//-------------------------------------------END OF ENDPOINTS-------------------------------------------

// Start Server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
