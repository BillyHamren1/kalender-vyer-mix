
import { Booking } from '@/types/booking';

export const transformBookingData = (dbBooking: any): Booking => {
  return {
    id: dbBooking.id,
    bookingNumber: dbBooking.booking_number,
    client: dbBooking.client,
    rigDayDate: dbBooking.rigdaydate,
    eventDate: dbBooking.eventdate,
    rigDownDate: dbBooking.rigdowndate,
    deliveryAddress: dbBooking.deliveryaddress,
    deliveryCity: dbBooking.delivery_city,
    deliveryPostalCode: dbBooking.delivery_postal_code,
    deliveryLatitude: dbBooking.delivery_latitude,
    deliveryLongitude: dbBooking.delivery_longitude,
    contactName: dbBooking.contact_name,
    contactPhone: dbBooking.contact_phone,
    contactEmail: dbBooking.contact_email,
    carryMoreThan10m: dbBooking.carry_more_than_10m,
    groundNailsAllowed: dbBooking.ground_nails_allowed,
    exactTimeNeeded: dbBooking.exact_time_needed,
    exactTimeInfo: dbBooking.exact_time_info,
    internalNotes: dbBooking.internalnotes,
    viewed: dbBooking.viewed,
    status: dbBooking.status,
    assignedProjectId: dbBooking.assigned_project_id,
    assignedProjectName: dbBooking.assigned_project_name,
    assignedToProject: dbBooking.assigned_to_project,
    largeProjectId: dbBooking.large_project_id,
    products: dbBooking.booking_products?.map((product: any) => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes,
      unitPrice: product.unit_price || undefined,
      totalPrice: product.total_price || undefined,
      parentProductId: product.parent_product_id || undefined,
      isPackageComponent: product.is_package_component || false,
      parentPackageId: product.parent_package_id || undefined,
      sku: product.sku || undefined
    })),
    attachments: dbBooking.booking_attachments?.map((attachment: any) => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type
    }))
  };
};

export const getStatusColor = (status: string): string => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-green-100 text-green-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const formatDateForDisplay = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Not set';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('sv-SE'); // Swedish format YYYY-MM-DD
  } catch (error) {
    return 'Invalid date';
  }
};

export const getProjectDisplayInfo = (booking: Booking) => {
  if (booking.assignedToProject && booking.assignedProjectName) {
    return {
      hasProject: true,
      displayName: booking.assignedProjectName,
      projectId: booking.assignedProjectId
    };
  }
  
  return {
    hasProject: false,
    displayName: null,
    projectId: null
  };
};
