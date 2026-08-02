const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const OMISE_WEBHOOK_SECRET =
  process.env.OMISE_WEBHOOK_SECRET;


// =====================================================
// สถานะ Payment
// =====================================================

let currentPayment = {

  chargeId: null,

  amount: 0,

  status: "idle",

  paid: false,

  used: false

};


// =====================================================
// เก็บ RAW BODY สำหรับตรวจ Signature
// =====================================================

app.use(
  express.json({
    verify: (req, res, buf) => {

      req.rawBody =
        Buffer.from(buf);

    }
  })
);


// =====================================================
// หน้าแรก
// =====================================================

app.get("/", (req, res) => {

  res.status(200).send(
    "PromptPay Server is running"
  );

});


// =====================================================
// สร้าง Payment
// ESP32 เรียก:
//
// /create-payment?amount=20
// =====================================================

app.get(
  "/create-payment",
  async (req, res) => {

    try {

      const amount =
        Number(req.query.amount);


      // ตรวจจำนวนเงิน

      if (
        !Number.isInteger(amount) ||
        amount < 20
      ) {

        return res.status(400).json({

          error:
            "Minimum amount is 20 THB"

        });

      }


      const OMISE_SECRET_KEY =
        process.env.OMISE_SECRET_KEY;


      if (!OMISE_SECRET_KEY) {

        return res.status(500).json({

          error:
            "OMISE_SECRET_KEY missing"

        });

      }


      // =================================================
      // บาท → สตางค์
      // =================================================

      const amountSatang =
        amount * 100;


      // =================================================
      // สร้าง PromptPay Charge
      // =================================================

      const params =
        new URLSearchParams();


      params.append(
        "amount",
        amountSatang
      );


      params.append(
        "currency",
        "THB"
      );


      params.append(
        "source[type]",
        "promptpay"
      );


      const auth =
        Buffer
          .from(
            `${OMISE_SECRET_KEY}:`
          )
          .toString("base64");


      const response =
        await fetch(

          "https://api.omise.co/charges",

          {

            method: "POST",

            headers: {

              "Authorization":
                `Basic ${auth}`,

              "Content-Type":
                "application/x-www-form-urlencoded"

            },

            body:
              params.toString()

          }

        );


      const data =
        await response.json();


      // =================================================
      // Omise Error
      // =================================================

      if (!response.ok) {

        console.log(
          "OMISE ERROR"
        );

        console.log(
          JSON.stringify(
            data,
            null,
            2
          )
        );


        return res.status(500).json({

          error:
            "Omise API error",

          detail:
            data

        });

      }


      // =================================================
      // เก็บรายการปัจจุบัน
      // =================================================

      currentPayment = {

        chargeId:
          data.id,

        amount:
          amount,

        status:
          data.status,

        paid:
          false,

        used:
          false

      };


      console.log(
        "NEW PAYMENT"
      );

      console.log(
        JSON.stringify(
          currentPayment,
          null,
          2
        )
      );


      // =================================================
      // ส่งข้อมูลกลับ
      // =================================================

      res.json({

        success:
          true,

        charge_id:
          data.id,

        amount:
          amount,

        status:
          data.status,

        authorize_uri:
          data.authorize_uri

      });

    }

    catch (error) {

      console.error(error);


      res.status(500).json({

        error:
          "Server error"

      });

    }

  }

);


// =====================================================
// WEBHOOK
// =====================================================

app.post(
  "/webhook",
  (req, res) => {

    console.log("");
    console.log(
      "=============================="
    );

    console.log(
      "OMISE WEBHOOK RECEIVED"
    );

    console.log(
      "=============================="
    );


    // =================================================
    // ตรวจ Webhook Secret
    // =================================================

    if (!OMISE_WEBHOOK_SECRET) {

      console.log(
        "Webhook secret missing"
      );

      return res
        .status(500)
        .send("Webhook secret missing");

    }


    const signature =
      req.headers[
        "omise-signature"
      ];


    const timestamp =
      req.headers[
        "omise-signature-timestamp"
      ];


    if (
      !signature ||
      !timestamp ||
      !req.rawBody
    ) {

      console.log(
        "Missing signature"
      );

      return res
        .status(401)
        .send("Invalid signature");

    }


    // =================================================
    // สร้าง Signature ที่เราคาดหวัง
    // =================================================

    const signedPayload =
      `${timestamp}.${req.rawBody.toString("utf8")}`;


    const expected =
      crypto
        .createHmac(
          "sha256",
          OMISE_WEBHOOK_SECRET
        )
        .update(
          signedPayload
        )
        .digest("hex");


    const incoming =
      signature.split(",");


    let valid =
      false;


    for (
      const item of incoming
    ) {

      const sig =
        item.trim();


      if (
        sig.length !==
        expected.length
      ) {

        continue;

      }


      if (
        crypto.timingSafeEqual(

          Buffer.from(
            sig,
            "utf8"
          ),

          Buffer.from(
            expected,
            "utf8"
          )

        )
      ) {

        valid =
          true;

        break;

      }

    }


    if (!valid) {

      console.log(
        "INVALID WEBHOOK SIGNATURE"
      );

      return res
        .status(401)
        .send(
          "Invalid signature"
        );

    }


    // =================================================
    // อ่าน Event
    // =================================================

    const event =
      req.body;


    console.log(
      "Event:",
      event.key
    );


    // =================================================
    // charge.create
    // =================================================

    if (
      event.key ===
      "charge.create"
    ) {

      console.log(
        "Charge created - NOT PAID"
      );

      return res
        .status(200)
        .send("OK");

    }


    // =================================================
    // charge.complete
    // =================================================

    if (
      event.key ===
      "charge.complete"
    ) {

      const charge =
        event.data;


      if (!charge) {

        return res
          .status(200)
          .send("OK");

      }


      console.log(
        "Charge ID:",
        charge.id
      );


      console.log(
        "Amount:",
        charge.amount
      );


      console.log(
        "Status:",
        charge.status
      );


      // =================================================
      // ตรวจ Charge ID
      // =================================================

      if (
        charge.id !==
        currentPayment.chargeId
      ) {

        console.log(
          "Charge ID does not match"
        );

        return res
          .status(200)
          .send("OK");

      }


      // =================================================
      // ตรวจจำนวนเงิน
      // =================================================

      const receivedAmount =
        Number(
          charge.amount
        ) / 100;


      if (
        receivedAmount !==
        currentPayment.amount
      ) {

        console.log(
          "Amount does not match"
        );

        return res
          .status(200)
          .send("OK");

      }


      // =================================================
      // ตรวจสถานะ
      // =================================================

      if (
        charge.status !==
        "successful"
      ) {

        console.log(
          "Payment not successful"
        );

        return res
          .status(200)
          .send("OK");

      }


      // =================================================
      // ป้องกันจ่ายซ้ำ
      // =================================================

      if (
        currentPayment.paid
      ) {

        console.log(
          "Already marked as paid"
        );

        return res
          .status(200)
          .send("OK");

      }


      // =================================================
      // PAYMENT SUCCESS
      // =================================================

      currentPayment.status =
        "successful";


      currentPayment.paid =
        true;


      currentPayment.used =
        false;


      console.log("");
      console.log(
        "******************************"
      );

      console.log(
        "PAYMENT SUCCESS!"
      );

      console.log(
        "Amount:",
        currentPayment.amount
      );

      console.log(
        "Charge:",
        currentPayment.chargeId
      );

      console.log(
        "******************************"
      );

    }


    res
      .status(200)
      .send("OK");

  }

);


// =====================================================
// ESP32 ตรวจสถานะ
// =====================================================

app.get(
  "/payment-status",
  (req, res) => {

    res.json({

      charge_id:
        currentPayment.chargeId,

      amount:
        currentPayment.amount,

      status:
        currentPayment.status,

      paid:
        currentPayment.paid,

      used:
        currentPayment.used

    });

  }

);


// =====================================================
// ESP32 ยืนยันว่าใช้เงินแล้ว
// =====================================================

app.post(
  "/payment-used",
  (req, res) => {

    if (
      !currentPayment.paid
    ) {

      return res.status(400).json({

        success:
          false,

        error:
          "Payment not completed"

      });

    }


    if (
      currentPayment.used
    ) {

      return res.status(400).json({

        success:
          false,

        error:
          "Payment already used"

      });

    }


    currentPayment.used =
      true;


    currentPayment.paid =
      false;


    currentPayment.status =
      "used";


    console.log(
      "PAYMENT MARKED AS USED"
    );


    res.json({

      success:
        true

    });

  }

);


// =====================================================
// SERVER
// =====================================================

app.listen(

  PORT,

  "0.0.0.0",

  () => {

    console.log(
      `PromptPay Server running on port ${PORT}`
    );

  }

);
