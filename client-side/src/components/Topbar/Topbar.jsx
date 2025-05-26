import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from '../component';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes, faSignOutAlt, faTachometerAlt, faCog } from "@fortawesome/free-solid-svg-icons";
import { authService } from "../../services/Auth.service"; 
import { logout } from "../../features/authSlice"; 

function Topbar() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const { status, userData } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const navItems = [
    { title: "Problems", redirection: "/" },
    { title: "Contest", redirection: "/contests" },
    { title: "My Progress", redirection: "/my-progress" },
  ];

  const handleLogout = async () => {
    await authService.logout();
    dispatch(logout());
    setIsUserDropdownOpen(false);
    navigate('/login');
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);
  
  useEffect(() => {
    if(isMobileNavOpen) setIsMobileNavOpen(false); // Close mobile nav on navigation change
  }, [navigate]);


  return (
    <nav className="bg-gray-900/80 backdrop-blur-md shadow-lg sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-between p-3 px-4 md:px-6">
        <Link
          to="/"
          className="flex items-center space-x-2 rtl:space-x-reverse"
        >
          <span className="self-center text-2xl font-semibold whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Cohort
          </span>
        </Link>

        <div className="flex items-center md:order-2 space-x-2 md:space-x-3 rtl:space-x-reverse">
          {status ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsUserDropdownOpen((prev) => !prev)}
                type="button"
                className="flex text-sm bg-gray-700 rounded-full focus:ring-4 focus:ring-gray-600"
                aria-expanded={isUserDropdownOpen}
              >
                <span className="sr-only">Open user menu</span>
                <img
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-500"
                  src={userData?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.fullName || 'User')}&background=random&color=fff`}
                  alt="user photo"
                />
              </button>

              {isUserDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-gray-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                >
                  <div className="py-1">
                    <div className="px-4 py-3 border-b border-gray-700">
                      <span className="block text-sm font-medium text-white truncate">
                        {userData?.fullName }
                      </span>
                      <span className="block text-sm text-gray-400 truncate">
                        {userData?.email }
                      </span>
                    </div>
                    <ul className="py-1">
                      
                      <li>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                        >
                          <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" /> Sign out
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <NavLink to="/login">
                <Button content="Login" bg="gray-700" text="gray-200" className="hover:bg-gray-600 px-3 py-1.5 text-sm" />
              </NavLink>
              <NavLink to="/signup">
                <Button content="Sign Up" bg="blue-600" text="white" className="hover:bg-blue-700 px-3 py-1.5 text-sm" />
              </NavLink>
            </div>
          )}

          <button
            onClick={() => setIsMobileNavOpen((prev) => !prev)}
            className="inline-flex items-center justify-center p-2 w-10 h-10 text-gray-400 rounded-lg md:hidden hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600"
            aria-controls="navbar-default"
            aria-expanded={isMobileNavOpen}
          >
            <span className="sr-only">Open main menu</span>
            <FontAwesomeIcon icon={isMobileNavOpen ? faTimes : faBars} className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`items-center justify-between w-full md:flex md:w-auto md:order-1 ${
            isMobileNavOpen ? "block mt-4 md:mt-0" : "hidden"
          }`}
          id="navbar-default"
        >
          <ul className="flex flex-col p-4 md:p-0 mt-4 font-medium rounded-lg bg-gray-800 md:bg-transparent md:space-x-6 rtl:space-x-reverse md:flex-row md:mt-0 md:border-0">
            {navItems.map((item) => (
              <li key={item.title}>
                <NavLink
                  to={item.redirection}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `block py-2 px-3 rounded transition-colors duration-150 
                    ${isActive
                      ? "text-blue-400 bg-blue-900/30 md:bg-transparent md:text-blue-400 font-semibold"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white md:hover:bg-transparent md:hover:text-blue-400"
                    } md:p-0`
                  }
                >
                  {item.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Topbar;