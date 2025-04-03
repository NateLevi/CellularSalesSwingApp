import { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// Initialize socket connection
const socket = io(import.meta.env.VITE_API_URL);

function formatWaitTime(createdAt, currentTime, status) {
  if (status.toLowerCase() === 'helped') {
    return 'Finished';
  }
  
  // Convert the createdAt (UTC) timestamp to Eastern Time
  const createdAtEastern = dayjs.utc(createdAt).tz('America/New_York');
  
  // Convert currentTime to Eastern Time as well
  const nowEastern = dayjs(currentTime).tz('America/New_York');
  
  const diffInSeconds = nowEastern.diff(createdAtEastern, 'second');
  const effectiveDiff = diffInSeconds < 0 ? 0 : diffInSeconds;
  const minutes = Math.floor(effectiveDiff / 60);
  const seconds = effectiveDiff % 60;
  
  return `${minutes}m ${seconds}s`;
}

const CustomerTable = () => {
  const [customers, setCustomers] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextCustomerNumber, setNextCustomerNumber] = useState(1);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);  

  // Fetch initial customer data
  useEffect(() => {
    axios.get(`${import.meta.env.VITE_API_URL}/api/customers`)
      .then(response => {
        setCustomers(response.data);
        setNextCustomerNumber(response.data.length + 1);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
      });
  }, []);

  // Listen for real-time updates from the server
  useEffect(() => {
    socket.on('customerUpdated', () => {
      axios.get(`${import.meta.env.VITE_API_URL}/api/customers`)
        .then(response => {
          setCustomers(response.data);
        })
        .catch(error => {
          console.error('Error reloading customers:', error);
        });
    });
    return () => socket.off('customerUpdated');
  }, []);

  // Handle "Add Customer" button click to create a new customer record
  const handleAddCustomer = async () => {
    try {
      const newCustomerData = {
        rep_id: null,
        customer_name: `Customer #${nextCustomerNumber}`,
        status: 'waiting'
      };
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/customers`, newCustomerData);
      setCustomers([...customers, response.data]);
      setNextCustomerNumber(nextCustomerNumber + 1);
      console.log('Added customer:', response.data);
    } catch (err) {
      console.error('Error adding customer:', err);
    }
  };

  const handleRemoveCustomer = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete the last customer?");
    if (!confirmDelete) return;
  
    try {
      const lastCustomer = customers[customers.length - 1];
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/customers/${lastCustomer.id}`);
      setCustomers(customers.slice(0, customers.length - 1));
    } catch (err) {
      console.error('Error removing customer:', err);
    }
  };

  return (
    <div className="flex flex-col items-center mb-20">
      <div className="card w-full max-w-4xl shadow-xl rounded-2xl overflow-x-auto">
        <h1 className="text-2xl font-bold text-center p-4">Waiting Customers ({customers.length})</h1>
        <table className="table table-zebra table-fixed w-full">
          <thead className="bg-black text-white sticky top-0">
            <tr>
              <th className="px-8 py-4 text-center">Line #</th>
              <th className="px-8 py-4 text-left">Customer</th>
              <th className="px-8 py-4 text-center">Status</th>
              <th className="px-8 py-4 text-center">Wait Time</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer, index) => (
              <tr key={customer.id} className="hover:bg-gray-100 text-1xl">
                <th className="px-8 py-4 text-center">{index + 1}</th>
                <td className="px-8 py-4 font-bold">{customer.customer_name}</td>
                <td className="px-8 py-4 text-center">
                  <span className="badge badge-info flex items-center justify-center">
                    <span
                      className={`inline-block w-3 h-3 mr-2 rounded-full ${
                        customer.status.toLowerCase() === 'waiting'
                          ? 'bg-red-500'
                          : customer.status.toLowerCase() === 'being helped'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                      }`}
                    ></span>
                    {customer.status}
                  </span>
                </td>
                <td className="px-8 py-4 text-center">
                {formatWaitTime(customer.created_at, currentTime, customer.status)}

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Button container placed below the table */}
      <div className="mt-4">
        <button 
          onClick={handleAddCustomer} 
          className="bg-black text-white p-2 rounded-md cursor-pointer mr-2">
          Add Customer
        </button>
        <button 
          onClick={handleRemoveCustomer}
          className="bg-black text-white p-2 rounded-md cursor-pointer">
          Remove Customer
        </button>
      </div>
    </div>
  );
};

export default CustomerTable;
