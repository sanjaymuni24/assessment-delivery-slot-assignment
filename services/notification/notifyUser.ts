import AppDataSource from "../../models/typeorm";
import { Notification } from "../../models/entities/Notification";
import { Order } from "../../models/entities/Order";
import { DeliverySlot } from "../../models/entities/DeliverySlot";
import { pubsub } from "./pubsub";

// Message templates for different notification types
const NOTIFICATION_TEMPLATES: Record<
  string,
  { title: string; template: string }
> = {
  order_created: {
    title: "Order Confirmation",
    template:
      "Your order #{orderId} has been received and is being processed. {deliveryInfo}",
  },
  order_confirmed: {
    title: "Order Confirmed",
    template:
      "Good news! Your order #{orderId} has been confirmed. {deliveryInfo}",
  },
  order_shipped: {
    title: "Order Shipped",
    template: "Your order #{orderId} is on its way to you! {deliveryInfo}",
  },
  order_delivered: {
    title: "Order Delivered",
    template: "Your order #{orderId} has been delivered. Enjoy!",
  },
  order_cancelled: {
    title: "Order Cancelled",
    template: "Your order #{orderId} has been cancelled. {reason}",
  },
  order_refunded: {
    title: "Order Refunded",
    template: "Your refund for order #{orderId} has been processed. {reason}",
  },
};

/**
 * Format a delivery slot into a human-readable string with assignment method info
 */
async function formatDeliveryTime(
  orderId: number,
  additionalData: Record<string, any> = {}
): Promise<string> {
  const dataSource = await AppDataSource.initialize();
  const orderRepository = dataSource.getRepository(Order);

  // Check if delivery slot info is provided in additionalData
  if (additionalData.deliverySlot && additionalData.slotAssignmentMethod) {
    const slot = additionalData.deliverySlot;
    const method = additionalData.slotAssignmentMethod;

    const startTime = new Date(slot.startTime);
    const endTime = new Date(slot.endTime);

    // Format day name
    const dayNames = [
      "Sunday", "Monday", "Tuesday", "Wednesday",
      "Thursday", "Friday", "Saturday"
    ];
    const dayName = dayNames[startTime.getDay()];

    // Format time (e.g., "2:00 PM - 5:00 PM")
    const formatTime = (date: Date) => {
      let hours = date.getHours();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // convert 0 to 12
      return `${hours}:00 ${ampm}`;
    };

    const timeSlot = `${dayName} ${formatTime(startTime)} - ${formatTime(endTime)}`;

    // Add method-specific messaging
    switch (method) {
      case 'user_selected':
        return `Your selected delivery time: ${timeSlot}`;
      case 'fallback':
        return `Your preferred time slot was unavailable, so we assigned the next available slot: ${timeSlot}`;
      case 'auto_assigned':
      default:
        return `Scheduled for ${timeSlot}`;
    }
  }

  // Fallback to database lookup if not provided in additionalData
  const order = await orderRepository.findOne({
    where: { id: orderId },
    relations: ["deliverySlot"],
  });

  if (!order || !order.deliverySlot) {
    return "Delivery details will be provided soon.";
  }

  const slot = order.deliverySlot;
  const startTime = new Date(slot.startTime);
  const endTime = new Date(slot.endTime);

  // Format day name
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayName = dayNames[startTime.getDay()];

  // Format time (e.g., "2:00 PM - 5:00 PM")
  const formatTime = (date: Date) => {
    let hours = date.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // convert 0 to 12
    return `${hours}:00 ${ampm}`;
  };

  return `Scheduled for ${dayName} ${formatTime(startTime)} - ${formatTime(
    endTime
  )}`;
}

/**
 * Sends a notification to a user about an order
 * @param orderId Order ID
 * @param type Notification type (order_created, order_confirmed, order_shipped, etc.)
 * @param userId User ID
 * @param additionalData Additional data for the notification message (including slotAssignmentMethod and deliverySlot)
 */
export async function notifyUser(
  orderId: number,
  type: string,
  userId: number,
  additionalData: Record<string, any> = {}
): Promise<Notification> {
  // Initialize database connection
  const dataSource = await AppDataSource.initialize();

  // Create notification repository
  const notificationRepository = dataSource.getRepository(Notification);

  try {
    // Get the notification template
    const template = NOTIFICATION_TEMPLATES[type];

    if (!template) {
      throw new Error(`Notification template for type '${type}' not found`);
    }

    // Get delivery information with slot assignment method context
    const deliveryInfo = await formatDeliveryTime(orderId, additionalData);

    // Prepare data for message interpolation
    const messageData = {
      orderId,
      deliveryInfo,
      ...additionalData,
    };

    // Generate notification content
    let content = template.template;

    // Replace placeholders in the template
    for (const [key, value] of Object.entries(messageData)) {
      // Skip complex objects when replacing placeholders
      if (typeof value === 'string' || typeof value === 'number') {
        content = content.replace(`{${key}}`, value.toString());
      }
    }

    // Create notification record
    const notification = new Notification();
    notification.userId = userId;
    notification.orderId = orderId;
    notification.type = type;
    notification.title = template.title;
    notification.content = content;
    notification.isRead = false;

    // Save notification
    const savedNotification = await notificationRepository.save(notification);

    // Publish notification to pubsub for external delivery (email, push, etc.)
    pubsub.publish("user:notification", {
      userId,
      orderId,
      type,
      title: template.title,
      content,
      notificationId: savedNotification.id,
    });

    return savedNotification;
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
    throw error;
  }
}