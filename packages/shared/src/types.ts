export type OrderStatus = 'open' | 'assigned' | 'arrived_pickup' | 'driving' | 'completed' | 'cancelled';
export type OrderKind = 'takson' | 'daeri';
export type PaymentMethod = 'cash' | 'postpaid';
export type DispatchMode = 'open' | 'staff_only';
export type PhotoPhase = 'pickup' | 'dropoff' | 'extra';
export type PhotoSlot = 'front' | 'back' | 'left' | 'right' | 'dashboard';
export type UserRole = 'driver' | 'customer' | 'staff';
export type StaffLevel = 'admin' | 'operator';
export type DriverStatus = 'pending' | 'active' | 'suspended';
export type FuelBilling = 'customer' | 'company';
export type AmendReason = 'dropoff_change' | 'waypoint_added' | 'mission_added';
export type Transmission = 'auto' | 'manual';

export const REQUIRED_SLOTS: readonly PhotoSlot[] = ['front', 'back', 'left', 'right', 'dashboard'];
