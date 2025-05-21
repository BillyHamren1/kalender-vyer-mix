
import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();
  
  // Add a new link to the weekly resource view
  const navigationLinks = [
    { href: '/resource-view', label: 'Resource View' },
    { href: '/weekly-view', label: '7-Day View' },
    { href: '/day-view', label: 'Day View' },
    { href: '/booking-list', label: 'Bookings' },
    { href: '/logistics-map', label: 'Logistics Map' }
  ];

  return (
    <nav className="bg-white shadow-sm py-4 px-6">
      <div className="container mx-auto flex justify-end">
        <ul className="flex space-x-6">
          {navigationLinks.map((link, index) => (
            <li key={index}>
              <Link 
                to={link.href} 
                className={`transition-colors ${location.pathname === link.href ? 'text-[#82b6c6] font-medium' : 'text-gray-600 hover:text-[#82b6c6]'}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
