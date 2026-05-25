import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StaffListTab from "@/components/staff-time-reports/StaffListTab";
import PendingApprovalsTab from "@/components/staff-time-reports/PendingApprovalsTab";

/**
 * Embedded version of StaffTimeReports (utan egen PageHeader och utan
 * Quick-link-cards) – avsedd för Tid & Lön-modulen, tab "Rapporter".
 */
const StaffTimeReportsContent: React.FC = () => {
  return (
    <div className="p-4">
      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Personal</TabsTrigger>
          <TabsTrigger value="pending">Att attestera</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <StaffListTab />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StaffTimeReportsContent;
