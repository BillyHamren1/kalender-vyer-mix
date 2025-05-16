
import { Link, useLocation } from "react-router-dom";
import { Grid2X2 } from "lucide-react";

const Navbar = () => {
  const location = useLocation();
  
  return (
    <nav className="bg-white shadow-sm py-4 px-6">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="bg-[#82b6c6] p-2 rounded">
            <Grid2X2 className="text-white h-5 w-5" />
          </div>
          <div className="font-semibold text-xl text-[#2d3748]">EventFlow</div>
        </div>
        
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
