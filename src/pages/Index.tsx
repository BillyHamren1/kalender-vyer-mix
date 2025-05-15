
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">BokningsKalendern</h1>
          <p className="text-xl text-gray-600 mb-10">
            En kraftfull bokningskalender med flera vyer för att hantera dina bokningar och resurser på ett effektivt sätt.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Resursvy</h2>
              <p className="text-gray-600 mb-6 text-center">
                Visa och hantera bokningar för dina resurser i ett vertikalt rutnät ordnat efter tid.
              </p>
              <Link to="/resource-view">
                <Button className="bg-blue-600 hover:bg-blue-700">Visa Resursvy</Button>
              </Link>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Tidslinjvy</h2>
              <p className="text-gray-600 mb-6 text-center">
                Se dina bokningar på en tidslinje för enkel översikt över alla resurser samtidigt.
              </p>
              <Link to="/timeline-view">
                <Button className="bg-blue-600 hover:bg-blue-700">Visa Tidslinjvy</Button>
              </Link>
            </div>
          </div>
          
          <p className="text-gray-500 italic">
            Byggd med FullCalendar - den mest populära kalenderlösningen för webben.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
