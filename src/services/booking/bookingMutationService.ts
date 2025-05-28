
import { supabase } from "@/integrations/supabase/client";

export const markBookingAsViewed = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ viewed: true })
    .eq('id', id);

  if (error) {
    console.error('Error marking booking as viewed:', error);
    throw error;
  }
};

export const updateBookingStatus = async (id: string, status: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

export const updateBookingDates = async (
  id: string, 
  dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate', 
  date: string | null
): Promise<void> => {
  const columnMap = {
    rigDayDate: 'rigdaydate',
    eventDate: 'eventdate',
    rigDownDate: 'rigdowndate'
  };

  const { error } = await supabase
    .from('bookings')
    .update({ [columnMap[dateType]]: date })
    .eq('id', id);

  if (error) {
    console.error(`Error updating ${dateType}:`, error);
    throw error;
  }
};

export const updateBookingLogistics = async (
  id: string, 
  logisticsData: {
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({
      carry_more_than_10m: logisticsData.carryMoreThan10m,
      ground_nails_allowed: logisticsData.groundNailsAllowed,
      exact_time_needed: logisticsData.exactTimeNeeded,
      exact_time_info: logisticsData.exactTimeInfo
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating logistics information:', error);
    throw error;
  }
};

export const updateDeliveryDetails = async (
  id: string, 
  deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({
      deliveryaddress: deliveryData.deliveryAddress,
      delivery_city: deliveryData.deliveryCity,
      delivery_postal_code: deliveryData.deliveryPostalCode,
      delivery_latitude: deliveryData.deliveryLatitude,
      delivery_longitude: deliveryData.deliveryLongitude,
      contact_name: deliveryData.contactName,
      contact_phone: deliveryData.contactPhone,
      contact_email: deliveryData.contactEmail
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating delivery details:', error);
    throw error;
  }
};
