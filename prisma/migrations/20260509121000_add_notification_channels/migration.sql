-- Store delivery channels selected for each notification.
ALTER TABLE "Notification"
ADD COLUMN "channels" TEXT[] DEFAULT ARRAY[]::TEXT[];
