import "dotenv/config";
import { db } from "@/db/client";
import { requests, workDays } from "@/db/schema";

async function main() {
  const plannedCount = 320 + 18 + 2;
  const notes = JSON.stringify({
    requestNumber: "OUM03.WZ7.45.850.2025",
    breakdown: {
      "Qn < 15 m3/h": 320,
      "Qn > 15 m3/h": 18,
      sprzężony: 2,
    },
  });

  await db.insert(requests).values({
    applicantName: "Wodociągi i Kanalizacja Opole",
    month: "2025-10",
    plannedCount,
    notes,
  });

  await db.insert(workDays).values({
    date: new Date() as any,
    isOpen: true,
    notes: "Start legalizacji",
  });

  console.log("Seed WiK Opole OK (wniosek + dzień pracy).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
