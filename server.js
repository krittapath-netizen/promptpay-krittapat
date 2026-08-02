const express = require("express");

const app = express();

app.use(express.json());

// ================================
// เก็บยอดเงินล่าสุด
// ================================

let lastPayment = {
  paid: false,
  amount: 0,
  transactionId: "",
  time: ""
};


// ================================
// หน้าแรก
// ================================

app.get("/", (req, res) => {

  res.send("PromptPay Server is running");

});


// ================================
// ตรวจสอบสถานะการจ่ายเงิน
// ESP32 จะเรียก URL นี้
// ================================

app.get("/payment-status", (req, res) => {

  res.json(lastPayment);

});


// ================================
// รับ Webhook จาก Omise
// ================================

app.post("/webhook", (req, res) => {

  console.log("================================");
  console.log("OMISE WEBHOOK RECEIVED");
  console.log("================================");

  console.log(JSON.stringify(req.body, null, 2));


  const event = req.body;


  // ตรวจ event ที่เกี่ยวกับ charge
  if (
    event &&
    event.data &&
    event.data.object
  ) {

    const charge = event.data.object;


    // ถ้าการชำระเงินสำเร็จ
    if (
      charge.status === "successful"
    ) {

      let amountBaht =
        Number(charge.amount) / 100;


      lastPayment = {

        paid: true,

        amount: amountBaht,

        transactionId:
          charge.id || "",

        time:
          new Date().toISOString()

      };


      console.log(
        "PAYMENT SUCCESS!"
      );

      console.log(
        "Amount:",
        amountBaht
      );

    }

  }


  // ต้องตอบกลับ Omise
  res.status(200).send("OK");

});


// ================================
// Reset สถานะการจ่ายเงิน
// ================================

app.post("/reset-payment", (req, res) => {

  lastPayment = {

    paid: false,

    amount: 0,

    transactionId: "",

    time: ""

  };


  res.json({
    success: true
  });

});


// ================================
// PORT
// ================================

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
