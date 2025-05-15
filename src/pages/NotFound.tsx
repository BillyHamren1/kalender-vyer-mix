
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
  );
};

export default NotFound;
