import { DeliverySlot } from "../../models/entities/DeliverySlot";
import { Order } from "../../models/entities/Order";
import { OrderItem } from "../../models/entities/OrderItem";
import { User } from "../../models/entities/User";
import AppDataSource from "../../models/typeorm";
import { IOrderInput, IOrderItemInput } from "../../types/schema";
import { assignDefaultSlot } from "../delivery/assignDefaultSlot";
import { notifyUser } from "../notification/notifyUser";
import { calculatePrice } from "./calculatePrice";
import { validateInventory } from "./validateInventory";
import { validateSlotAvailability } from "../delivery/validateSlotAvailability";
/**
 * Creates a new order with the provided details
 * Handles the complete order creation flow including:
 * - Inventory validation
 * - Price calculation
 * - Delivery slot assignment
 * - Order and order items saving
 * - User notification
 */
export async function createOrder(orderInput: IOrderInput): Promise<Order> {
  // Initialize database connection
  const dataSource = await AppDataSource.initialize();

  // Create repositories
  const orderRepository = dataSource.getRepository(Order);
  const orderItemRepository = dataSource.getRepository(OrderItem);
  const userRepository = dataSource.getRepository(User);
  const slotRepository = dataSource.getRepository(DeliverySlot);

  try {
    // Begin transaction
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate inventory
      const inventoryValidation = await validateInventory(orderInput.items);
      if (!inventoryValidation.valid) {
        throw new Error(
          `Inventory validation failed: ${inventoryValidation.errors.join(
            ", "
          )}`
        );
      }

      // Step 2: Check if user exists
      const user = await userRepository.findOneBy({ id: orderInput.userId });
      if (!user) {
        throw new Error(`User with ID ${orderInput.userId} not found`);
      }

      // Step 3: Calculate price
      const priceDetails = await calculatePrice(orderInput.items);

      // Step 4: Assign delivery slot
      let deliverySlot: DeliverySlot | null = null;
      let deliverySlotId: number | null = null;
      let slotAssignmentMethod: 'user_selected' | 'auto_assigned' | 'fallback' = 'auto_assigned';

      // Check if user provided a preferred slot
      if (orderInput.preferredSlotId) {
        // Validate the user-selected slot
        const slotValidation = await validateSlotAvailability(orderInput.preferredSlotId);

        if (slotValidation.isAvailable && slotValidation.slot) {
          // Use the user-selected slot
          deliverySlot = slotValidation.slot;
          deliverySlotId = deliverySlot.id;
          slotAssignmentMethod = 'user_selected';

          // Update slot capacity
          deliverySlot.currentUsage += 1;
          await queryRunner.manager.save(DeliverySlot, deliverySlot);
        } else {
          // Auto-fallback when selected slot is unavailable
          console.warn(`User selected unavailable slot: ${slotValidation.message}`);
          deliverySlot = await assignDefaultSlot();
          slotAssignmentMethod = 'fallback';
        }
      } else {
        // Use default strategy when no preference provided
        deliverySlot = await assignDefaultSlot();
      }

      // Handle case where no slot could be assigned
      if (!deliverySlot) {
        throw new Error("No delivery slots available");
      }

      // Set the delivery slot ID
      deliverySlotId = deliverySlot.id;

      // Step 5: Create order
      const newOrder = new Order();
      newOrder.userId = orderInput.userId;
      newOrder.addressId = orderInput.addressId;
      newOrder.deliverySlotId = deliverySlotId;
      newOrder.totalAmount = priceDetails.totalAmount;
      newOrder.status = "pending";

      // Save order to get ID
      const savedOrder = await orderRepository.save(newOrder);

      // Step 6: Create order items
      const orderItems = orderInput.items.map((item: IOrderItemInput) => {
        const orderItem = new OrderItem();
        orderItem.orderId = savedOrder.id;
        orderItem.skuId = item.skuId;
        orderItem.quantity = item.qty;
        orderItem.unitPrice = priceDetails.itemPrices[item.skuId] || 0;
        orderItem.discount = priceDetails.itemDiscounts[item.skuId] || 0;
        orderItem.subtotal =
          (orderItem.unitPrice - orderItem.discount) * orderItem.quantity;
        return orderItem;
      });

      // Save all order items
      await orderItemRepository.save(orderItems);

      // Step 7: Notify user about order creation
      await notifyUser(savedOrder.id, "order_created", user.id, {
        slotAssignmentMethod,
        deliverySlot: deliverySlot ? {
          id: deliverySlot.id,
          startTime: deliverySlot.startTime,
          endTime: deliverySlot.endTime
        } : null
      });

      // Commit transaction
      await queryRunner.commitTransaction();

      // Return the complete order with items
      const completeOrder = await orderRepository.findOne({
        where: { id: savedOrder.id },
        relations: ["items", "deliverySlot", "user"],
      });

      if (!completeOrder) {
        throw new Error(
          `Failed to retrieve the created order with ID ${savedOrder.id}`
        );
      }

      return completeOrder;
    } catch (error) {
      // Rollback transaction in case of error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  } catch (error) {
    // Re-throw the error for handling by the API layer
    throw error;
  }
}
