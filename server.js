const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

// รับ JSON จาก Omise
app.use(express.json());

// ================================
// หน้าเช็ก Server
// ================================

app.get("/", (req, res) => {
  res.send("PromptPay Server is running");
});

// ================================
// Webhook จาก Omise
// ================================

app.post("/webhook", (req, res) => {

  console.log("");
  console.log("==============================");
  console.log("OMISE WEBHOOK RECEIVED");
  console.log("==============================");

  console.log(JSON.stringify(req.body, null, 2));

  // ตอบ Omise ก่อน
  res.status(200).send("OK");

  const event = req.body;

  // แสดงประเภท Event
  console.log("Event:", event.key);

  // ถ้ามีข้อมูล charge
  if (event.data) {

    console.log("Data ID:", event.data.id);
    console.log("Amount:", event.data.amount);
    console.log("Currency:", event.data.currency);
    console.log("Status:", event.data.status);

  }

});

app.listen(PORT, () => {

  console.log(
    `PromptPay Server running on port ${PORT}`
  );

});
