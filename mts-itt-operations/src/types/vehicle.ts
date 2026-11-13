export interface PrimeMover {
  id: string;
  regNo: string;
  vehicleType: string;
  make: string;
  model: string;
  year: number;
  trailerId: string | null;
  driverId: string | null;
  status: "Active" | "In Maintenance" | "Inactive";
  odometerKm: number;
  nextServiceDate: string;
}

export interface Trailer {
  id: string;
  regNo: string;
  trailerType: string;
  /** e.g. "1 x 40FT or 2 x 20FT" */
  capacity: string;
  primeMoverId: string | null;
  status: "Active" | "In Maintenance" | "Inactive";
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  date: string;
  serviceType: string;
  description: string;
  cost: number;
  nextServiceDate: string;
  status: "Completed" | "Scheduled" | "Overdue";
}
