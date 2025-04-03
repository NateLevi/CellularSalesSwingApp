import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

const NavBar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut(auth)        // Sign out the user via Firebase
      setDropdownOpen(false)       // Close the dropdown
      navigate('/login')           // Redirect to the login page
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <header className="bg-black text-white h-20 shadow-lg grid grid-cols-3 items-center px-6">
      <div /> 
      <Link to="/home" className="text-2xl font-bold flex justify-center">
      <img
          src="/cslogo.png"
          alt="CS Hub Logo"
          className="h-12 w-auto"
        /></Link>
      <nav className="flex justify-end items-center space-x-8">
        <div 
          className="relative"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <button className="hover:text-gray-300">
            <FontAwesomeIcon icon={faUser} className="text-3xl" />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 w-40 bg-black border border-gray-700 rounded-md shadow-lg">
              <ul className="py-1">
                <li>
                  <button 
                    onClick={handleSignOut}
                    className="block px-4 py-2 text-1xl hover:bg-gray-700 w-full text-left cursor-pointer"
                  >
                    Sign Out
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}

export default NavBar
