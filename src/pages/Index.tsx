
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Grid2X2, Calendar, ShoppingCart, Users, Map } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Grid2X2 className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">EventFlow</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <p className="text-xl text-gray-600 mb-10">
            Välkommen till ditt kompletta event management system
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
            <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center text-center">
              <div className="bg-gray-100 p-4 rounded-full mb-6">
                <ShoppingCart className="text-[#82b6c6] h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-[#2d3748] mb-3">Bokningar</h2>
              <p className="text-gray-600 mb-6">
                Hantera bokningar, klienter och försäljningsrapporter
              </p>
              <Link to="/booking-list" className="mt-auto">
                <Button className="bg-[#82b6c6] hover:bg-[#6a99a8] text-white">
                  Se bokningar
                </Button>
              </Link>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center text-center">
              <div className="bg-gray-100 p-4 rounded-full mb-6">
                <Calendar className="text-[#82b6c6] h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-[#2d3748] mb-3">Resurser</h2>
              <p className="text-gray-600 mb-6">
                Hantera resurser, projekt och planering
              </p>
              <Link to="/resource-view" className="mt-auto">
                <Button className="bg-[#82b6c6] hover:bg-[#6a99a8] text-white">
                  Se resursvy
                </Button>
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center text-center">
              <div className="bg-gray-100 p-4 rounded-full mb-6">
                <Users className="text-[#82b6c6] h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-[#2d3748] mb-3">Personal</h2>
              <p className="text-gray-600 mb-6">
                Hantera personal, team och schemaläggning
              </p>
              <Link to="/staff-management" className="mt-auto">
                <Button className="bg-[#82b6c6] hover:bg-[#6a99a8] text-white">
                  Se personal
                </Button>
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center text-center">
              <div className="bg-gray-100 p-4 rounded-full mb-6">
                <Map className="text-[#82b6c6] h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-[#2d3748] mb-3">Logistikkarta</h2>
              <p className="text-gray-600 mb-6">
                Visa alla geocodade jobb på karta med filter
              </p>
              <Link to="/logistics-map" className="mt-auto">
                <Button className="bg-[#82b6c6] hover:bg-[#6a99a8] text-white">
                  Se karta
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
