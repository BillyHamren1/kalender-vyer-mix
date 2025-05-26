
import React, { useState, createContext } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Navbar from './components/Navigation/Navbar';
import Index from './pages/Index';
import ResourceView from './pages/ResourceView';
import WeeklyResourceView from './pages/WeeklyResourceView';
import MonthlyResourceView from './pages/MonthlyResourceView';
import TestMonthlyView from './pages/TestMonthlyView';
import DayView from './pages/DayView';
import BookingList from './pages/BookingList';
import BookingDetail from './pages/BookingDetail';
import JobsList from './pages/JobsList';
import MonthlyBookingSchedule from './pages/MonthlyBookingSchedule';
import LogisticsMap from './pages/LogisticsMap';
import APITester from './pages/APITester';
import StaffEndpoint from './pages/StaffEndpoint';
import NotFound from './pages/NotFound';
import StaffCalendarView from './pages/StaffCalendarView';

const queryClient = new QueryClient();

interface CalendarContextProps {
  lastViewedDate: Date;
  setLastViewedDate: (date: Date) => void;
  lastPath?: string;
  setLastPath?: (path: string) => void;
}

export const CalendarContext = createContext<CalendarContextProps>({
  lastViewedDate: new Date(),
  setLastViewedDate: () => {},
  lastPath: undefined,
  setLastPath: () => {}
});

function App() {
  const [lastViewedDate, setLastViewedDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem('calendarDate');
    return saved ? new Date(saved) : new Date();
  });

  const [lastPath, setLastPath] = useState<string>();

  return (
    <CalendarContext.Provider value={{ lastViewedDate, setLastViewedDate, lastPath, setLastPath }}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gray-50">
          <Router>
            <Navbar />
            <Toaster />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/resource-view" element={<ResourceView />} />
              <Route path="/weekly-view" element={<WeeklyResourceView />} />
              <Route path="/monthly-view" element={<MonthlyResourceView />} />
              <Route path="/staff-calendar" element={<StaffCalendarView />} />
              <Route path="/test-monthly-view" element={<TestMonthlyView />} />
              <Route path="/day-view" element={<DayView />} />
              <Route path="/booking-list" element={<BookingList />} />
              <Route path="/booking/:bookingId" element={<BookingDetail />} />
              <Route path="/jobs-list" element={<JobsList />} />
              <Route path="/monthly-schedule" element={<MonthlyBookingSchedule />} />
              <Route path="/logistics-map" element={<LogisticsMap />} />
              <Route path="/api-tester" element={<APITester />} />
              <Route path="/staff-endpoint" element={<StaffEndpoint />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </div>
      </QueryClientProvider>
    </CalendarContext.Provider>
  );
}

export default App;
