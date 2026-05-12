-- Store delivery channels selected for each notification.
ALTER TABLE "Notification"
ADD COLUMN "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
