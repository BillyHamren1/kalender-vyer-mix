
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="bg-white border-b border-gray-200 py-4 px-6 shadow-sm">
      <div className="container mx-auto flex justify-between items-center">
        <div className="font-semibold text-xl text-blue-600">BokningsKalendern</div>
        
        <ul className="flex space-x-6">
          <li>
            <Link 
              to="/" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              Hem
            </Link>
          </li>
          <li>
            <Link 
              to="/resource-view" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              Resursvy
            </Link>
          </li>
          <li>
            <Link 
              to="/booking-list" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
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
