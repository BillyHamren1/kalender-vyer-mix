
import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();
  
  return (
    <nav className="bg-white shadow-sm py-4 px-6">
      <div className="container mx-auto flex justify-end">
        <ul className="flex space-x-6">
          <li>
            <Link 
              to="/" 
              className={`transition-colors ${location.pathname === '/' ? 'text-[#82b6c6] font-medium' : 'text-gray-600 hover:text-[#82b6c6]'}`}
            >
              Hem
            </Link>
          </li>
          <li>
            <Link 
              to="/resource-view" 
              className={`transition-colors ${location.pathname === '/resource-view' ? 'text-[#82b6c6] font-medium' : 'text-gray-600 hover:text-[#82b6c6]'}`}
            >
              Resursvy
            </Link>
          </li>
          <li>
            <Link 
              to="/day-view" 
              className={`transition-colors ${location.pathname === '/day-view' ? 'text-[#82b6c6] font-medium' : 'text-gray-600 hover:text-[#82b6c6]'}`}
            >
              Dagvy
            </Link>
          </li>
          <li>
            <Link 
              to="/booking-list" 
              className={`transition-colors ${location.pathname === '/booking-list' ? 'text-[#82b6c6] font-medium' : 'text-gray-600 hover:text-[#82b6c6]'}`}
            >
              Bokningslista
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
