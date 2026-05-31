-- Mission FSM: 9 official states (architecture V1)
ALTER TYPE "MissionStatus" RENAME TO "MissionStatus_old";

CREATE TYPE "MissionStatus" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'ARRIVED',
  'LOADED',
  'IN_TRANSIT',
  'DELIVERED',
  'VERIFIED',
  'SETTLED'
);

ALTER TABLE "missions" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "missions"
  ALTER COLUMN "status" TYPE "MissionStatus"
  USING (
    CASE "status"::text
      WHEN 'ASSIGNED' THEN 'ASSIGNED'::"MissionStatus"
      WHEN 'LOADING' THEN 'ARRIVED'::"MissionStatus"
      WHEN 'ON_THE_WAY' THEN 'IN_TRANSIT'::"MissionStatus"
      WHEN 'UNLOADING' THEN 'DELIVERED'::"MissionStatus"
      WHEN 'COMPLETED' THEN 'VERIFIED'::"MissionStatus"
      WHEN 'APPROVED' THEN 'VERIFIED'::"MissionStatus"
      WHEN 'REJECTED' THEN 'DELIVERED'::"MissionStatus"
      WHEN 'CANCELED' THEN 'CREATED'::"MissionStatus"
      ELSE 'CREATED'::"MissionStatus"
    END
  );

ALTER TABLE "missions" ALTER COLUMN "status" SET DEFAULT 'CREATED'::"MissionStatus";

DROP TYPE "MissionStatus_old";
