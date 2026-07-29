-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "IncidentPriority" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "assignee" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_status_history" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "fromStatus" "IncidentStatus",
    "toStatus" "IncidentStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_priority_idx" ON "incidents"("priority");

-- CreateIndex
CREATE INDEX "incidents_slaDeadline_idx" ON "incidents"("slaDeadline");

-- CreateIndex
CREATE INDEX "incidents_assignee_idx" ON "incidents"("assignee");

-- CreateIndex
CREATE INDEX "incident_status_history_incidentId_changedAt_idx"
ON "incident_status_history"("incidentId", "changedAt");

-- AddForeignKey
ALTER TABLE "incident_status_history"
ADD CONSTRAINT "incident_status_history_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "incidents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
