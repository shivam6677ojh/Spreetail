-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('MEMBER', 'ADMIN');
CREATE TYPE "ExpenseSplitMethod" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE');
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ANOMALIES', 'FAILED');
CREATE TYPE "AnomalySeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "group_members_valid_interval_check" CHECK ("left_at" IS NULL OR "left_at" >= "joined_at")
);

CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "paid_by_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "import_id" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "split_method" "ExpenseSplitMethod" NOT NULL DEFAULT 'EXACT',
    "expense_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expenses_positive_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "expenses_currency_uppercase_check" CHECK ("currency" = UPPER("currency"))
);

CREATE TABLE "expense_participants" (
    "expense_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    CONSTRAINT "expense_participants_pkey" PRIMARY KEY ("expense_id", "user_id"),
    CONSTRAINT "expense_participants_nonnegative_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "paid_by_id" UUID NOT NULL,
    "paid_to_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "settlements_positive_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "settlements_distinct_parties_check" CHECK ("paid_by_id" <> "paid_to_id"),
    CONSTRAINT "settlements_currency_uppercase_check" CHECK ("currency" = UPPER("currency"))
);

CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "imported_by_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "anomalous_rows" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "imports_nonnegative_counts_check" CHECK (
        ("total_rows" IS NULL OR "total_rows" >= 0) AND
        "imported_rows" >= 0 AND
        "anomalous_rows" >= 0
    ),
    CONSTRAINT "imports_valid_counts_check" CHECK (
        "total_rows" IS NULL OR "imported_rows" + "anomalous_rows" <= "total_rows"
    ),
    CONSTRAINT "imports_valid_interval_check" CHECK (
        "completed_at" IS NULL OR ("started_at" IS NOT NULL AND "completed_at" >= "started_at")
    )
);

CREATE TABLE "import_anomalies" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "resolved_by_id" UUID,
    "row_number" INTEGER,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "raw_data" JSONB,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_anomalies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_anomalies_positive_row_check" CHECK ("row_number" IS NULL OR "row_number" > 0),
    CONSTRAINT "import_anomalies_resolution_check" CHECK (
        "resolved_by_id" IS NULL OR "resolved_at" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "groups_created_by_id_idx" ON "groups"("created_by_id");
CREATE INDEX "group_members_group_id_left_at_idx" ON "group_members"("group_id", "left_at");
CREATE INDEX "group_members_user_id_left_at_idx" ON "group_members"("user_id", "left_at");
CREATE UNIQUE INDEX "group_members_group_id_user_id_joined_at_key" ON "group_members"("group_id", "user_id", "joined_at");
CREATE UNIQUE INDEX "group_members_one_active_membership_key" ON "group_members"("group_id", "user_id") WHERE "left_at" IS NULL;
CREATE INDEX "expenses_group_id_expense_date_idx" ON "expenses"("group_id", "expense_date");
CREATE INDEX "expenses_paid_by_id_idx" ON "expenses"("paid_by_id");
CREATE INDEX "expenses_created_by_id_idx" ON "expenses"("created_by_id");
CREATE INDEX "expenses_import_id_idx" ON "expenses"("import_id");
CREATE INDEX "expense_participants_user_id_idx" ON "expense_participants"("user_id");
CREATE INDEX "settlements_group_id_settled_at_idx" ON "settlements"("group_id", "settled_at");
CREATE INDEX "settlements_paid_by_id_idx" ON "settlements"("paid_by_id");
CREATE INDEX "settlements_paid_to_id_idx" ON "settlements"("paid_to_id");
CREATE INDEX "settlements_recorded_by_id_idx" ON "settlements"("recorded_by_id");
CREATE INDEX "imports_group_id_created_at_idx" ON "imports"("group_id", "created_at");
CREATE INDEX "imports_imported_by_id_idx" ON "imports"("imported_by_id");
CREATE INDEX "imports_status_idx" ON "imports"("status");
CREATE UNIQUE INDEX "imports_group_id_file_hash_key" ON "imports"("group_id", "file_hash");
CREATE INDEX "import_anomalies_import_id_severity_idx" ON "import_anomalies"("import_id", "severity");
CREATE INDEX "import_anomalies_import_id_resolved_at_idx" ON "import_anomalies"("import_id", "resolved_at");
CREATE INDEX "import_anomalies_resolved_by_id_idx" ON "import_anomalies"("resolved_by_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_participants" ADD CONSTRAINT "expense_participants_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_participants" ADD CONSTRAINT "expense_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_to_id_fkey" FOREIGN KEY ("paid_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
