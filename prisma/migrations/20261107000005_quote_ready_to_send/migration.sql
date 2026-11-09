-- A quote that needs no approval waits for the sales head to send it.
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "QuoteStatus" ADD VALUE 'ready_to_send' AFTER 'rejected';
