-- CORE-OS-0: additive operation_types catalog (no FKs on operation_needs/missions)

CREATE TABLE IF NOT EXISTS "operation_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name_fa" TEXT NOT NULL,
    "name_en" TEXT,
    "verification_kind" TEXT NOT NULL,
    "pricing_kind" TEXT NOT NULL,
    "settlement_kind" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "operation_types_code_key" ON "operation_types"("code");

INSERT INTO "operation_types" (
    "id",
    "code",
    "category",
    "name_fa",
    "name_en",
    "verification_kind",
    "pricing_kind",
    "settlement_kind",
    "is_active"
) VALUES
    (
        'cmcoreos0haultonnage01',
        'HAUL_TONNAGE',
        'LOGISTICS',
        'حمل تناژی',
        'Haul tonnage',
        'WEIGHBRIDGE',
        'RATE_CARD_TONNAGE',
        'OPERATIONAL_PLUS_COMMUNITY_TON',
        true
    ),
    (
        'cmcoreos0hourlyequip01',
        'HOURLY_EQUIPMENT',
        'MACHINERY',
        'تجهیزات ساعتی',
        'Hourly equipment',
        'HOURLY_LOG',
        'HOURLY',
        'HOURLY_ONLY',
        true
    )
ON CONFLICT ("code") DO NOTHING;
