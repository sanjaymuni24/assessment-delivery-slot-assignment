// User Types
export interface IUser {
  id: number;
  email: string;
  name: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserInput {
  email: string;
  name: string;
  phone?: string;
}

// Order Types
export interface IOrder {
  id: number;
  userId: number;
  deliverySlotId?: number;
  addressId: number;
  totalAmount: number;
  status: OrderStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  user?: IUser;
  deliverySlot?: IDeliverySlot;
  items?: IOrderItem[];
}

export interface IOrderInput {
  userId: number;
  addressId: number;
  items: IOrderItemInput[];
  preferredSlotId?: number; // Add this optional field
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

// OrderItem Types
export interface IOrderItem {
  id: number;
  orderId: number;
  skuId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderItemInput {
  skuId: string;
  qty: number;
}

// DeliverySlot Types
export interface IDeliverySlot {
  id: number;
  startTime: Date;
  endTime: Date;
  maxCapacity: number;
  currentUsage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeliverySlotInput {
  startTime: Date;
  endTime: Date;
  maxCapacity: number;
  isActive?: boolean;
}

// Notification Types
export interface INotification {
  id: number;
  userId: number;
  orderId?: number;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export interface INotificationInput {
  userId: number;
  orderId?: number;
  type: string;
  title: string;
  content: string;
}

// RiskAlert Types
export interface IRiskAlert {
  id: number;
  orderId: number;
  riskType: string;
  riskScore: number;
  details?: string;
  status: RiskAlertStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export type RiskAlertStatus = 'pending' | 'reviewed' | 'cleared' | 'flagged'; 