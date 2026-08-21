import { Navigate } from "react-router-dom";

/**
 * Legacy route kept for old bookmarks and deep links.
 * Dashboard + packing planning now live together in /warehouse (Lager OPS).
 */
const PackingManagement = () => <Navigate to="/warehouse" replace />;

export default PackingManagement;
