import { DeliverySlot } from "../../models/entities/DeliverySlot";
import AppDataSource from "../../models/typeorm";

export async function validateSlotAvailability(slotId: number): Promise<{
    isAvailable: boolean;
    slot: DeliverySlot | null;
    message?: string;
}> {
    const dataSource = await AppDataSource.initialize();
    const slotRepository = dataSource.getRepository(DeliverySlot);

    try {
        const slot = await slotRepository.findOneBy({ id: slotId });

        if (!slot) {
            return {
                isAvailable: false,
                slot: null,
                message: `Delivery slot with ID ${slotId} not found`
            };
        }
        // active flag check
        if (!slot.isActive) {
            return { isAvailable: false, slot, message: "Selected delivery slot is inactive" };
        }
        // Check if slot has available capacity
        if (slot.currentUsage >= slot.maxCapacity) {
            return {
                isAvailable: false,
                slot,
                message: `Selected delivery slot is full (${slot.currentUsage}/${slot.maxCapacity})`
            };
        }

        // Check if slot is in the future (assuming slots have a datetime field)
        const now = new Date();
        if (slot.startTime <= now) {
            return {
                isAvailable: false,
                slot,
                message: `Selected delivery slot has already passed`
            };
        }

        return {
            isAvailable: true,
            slot
        };
    } catch (error) {
        throw new Error(`Error validating slot availability: ${error}`);
    }
}