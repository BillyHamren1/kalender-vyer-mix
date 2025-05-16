
import { Link } from "react-router-dom";
import { Grid2X2 } from "lucide-react";

const Navbar = () => {
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
              className="text-gray-600 hover:text-[#82b6c6] transition-colors"
            >
              Hem
            </Link>
          </li>
          <li>
            <Link 
              to="/resource-view" 
              className="text-gray-600 hover:text-[#82b6c6] transition-colors"
            >
              Resursvy
            </Link>
          </li>
          <li>
            <Link 
              to="/day-view" 
              className="text-gray-600 hover:text-[#82b6c6] transition-colors"
            >
              Dagvy
            </Link>
          </li>
          <li>
            <Link 
              to="/booking-list" 
              className="text-gray-600 hover:text-[#82b6c6] transition-colors"
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
