
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">Page Not Found</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center flex-1 pt-20">
        <div className="text-center bg-white p-12 rounded-lg shadow-md max-w-md">
          <h1 className="text-4xl font-bold mb-4 text-[#2d3748]">404</h1>
          <p className="text-xl text-gray-600 mb-8">Oops! Sidan kunde inte hittas</p>
          <Link to="/">
            <Button className="bg-[#82b6c6] hover:bg-[#6a99a8] text-white">
              Tillbaka till startsidan
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
