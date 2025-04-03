CREATE TABLE SalesReps (
  id SERIAL PRIMARY KEY,
  firebase_id VARCHAR(255) UNIQUE NOT NULL, -- Added UNIQUE constraint, good practice
  name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  total_customers INTEGER DEFAULT 0, -- Added comma
  finished_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL -- Corrected type
);

CREATE TABLE Customers (
  id SERIAL PRIMARY KEY,
  rep_id INTEGER REFERENCES SalesReps(id) ON DELETE SET NULL, -- Ensure SalesReps is capitalized if table name is
  customer_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'waiting',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Added TIME ZONE, good practice
);