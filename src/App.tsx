
import React, { useState, createContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navigation/Navbar";
import WeeklyResourceView from "./pages/WeeklyResourceView";
import CustomCalendarPage from "./pages/CustomCalendarPage";
import MonthlyResourceView from "./pages/MonthlyResourceView";
import ResourceView from "./pages/ResourceView";
import StaffManagement from "./pages/StaffManagement";
import { resetColorAssignments } from "./utils/uniqueStaffColors";

interface CalendarContextProps {
  lastViewedDate: Date | null;
  setLastViewedDate: React.Dispatch<React.SetStateAction<Date | null>>;
}

export const CalendarContext = createContext<CalendarContextProps>({
  lastViewedDate: null,
  setLastViewedDate: () => {},
});

const queryClient = new QueryClient();

function App() {
  const [lastViewedDate, setLastViewedDate] = useState<Date | null>(() => {
    const storedDate = sessionStorage.getItem('calendarDate');
    return storedDate ? new Date(storedDate) : null;
  });

  // Reset color assignments on app load
  React.useEffect(() => {
    resetColorAssignments();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CalendarContext.Provider value={{ lastViewedDate, setLastViewedDate }}>
        <div className="min-h-screen">
          <Router>
            <Navbar />
            <Routes>
              <Route path="/" element={<WeeklyResourceView />} />
              <Route path="/weekly-view" element={<WeeklyResourceView />} />
              <Route path="/monthly-view" element={<MonthlyResourceView />} />
              <Route path="/resource-view" element={<ResourceView />} />
              <Route path="/staff-management" element={<StaffManagement />} />
              <Route path="/custom-calendar" element={<CustomCalendarPage />} />
            </Routes>
          </Router>
        </div>
      </CalendarContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
