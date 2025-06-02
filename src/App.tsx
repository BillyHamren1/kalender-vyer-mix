
import React, { useState, createContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navigation/Navbar";
import WeeklyResourceView from "./pages/WeeklyResourceView";
import CustomCalendarPage from "./pages/CustomCalendarPage";
import StaffManagement from "./pages/StaffManagement";
import BookingDetail from "./pages/BookingDetail";
import LogisticsMap from "./pages/LogisticsMap";
import JobsList from "./pages/JobsList";
import { resetColorAssignments } from "./utils/uniqueStaffColors";

interface CalendarContextProps {
  lastViewedDate: Date | null;
  setLastViewedDate: React.Dispatch<React.SetStateAction<Date | null>>;
  lastPath: string | null;
  setLastPath: React.Dispatch<React.SetStateAction<string | null>>;
}

export const CalendarContext = createContext<CalendarContextProps>({
  lastViewedDate: null,
  setLastViewedDate: () => {},
  lastPath: null,
  setLastPath: () => {},
});

const queryClient = new QueryClient();

function App() {
  const [lastViewedDate, setLastViewedDate] = useState<Date | null>(() => {
    const storedDate = sessionStorage.getItem('calendarDate');
    return storedDate ? new Date(storedDate) : null;
  });
  
  const [lastPath, setLastPath] = useState<string | null>(null);

  // Reset color assignments on app load
  React.useEffect(() => {
    resetColorAssignments();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CalendarContext.Provider value={{ lastViewedDate, setLastViewedDate, lastPath, setLastPath }}>
        <div className="min-h-screen">
          <Router>
            <Navbar />
            <Routes>
              <Route path="/" element={<WeeklyResourceView />} />
              <Route path="/weekly-view" element={<WeeklyResourceView />} />
              <Route path="/custom-calendar" element={<CustomCalendarPage />} />
              <Route path="/staff-management" element={<StaffManagement />} />
              <Route path="/booking/:id" element={<BookingDetail />} />
              <Route path="/booking/:bookingId" element={<BookingDetail />} />
              <Route path="/logistics-map" element={<LogisticsMap />} />
              <Route path="/jobs-list" element={<JobsList />} />
            </Routes>
          </Router>
        </div>
      </CalendarContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
