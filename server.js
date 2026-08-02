const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const OMISE_SECRET_KEY =
  process.env.OMISE_SECRET_KEY;


// =====================================================
// JSON
// =====================================================

app.use(express.json());


// =====================================================
// สถานะการจ่าย
// =====================================================

let currentPayment = {

  chargeId: null,

  amount: 0,

  status: "idle",

  paid: false

};


// =====================================================
// หน้าแรก
// =====================================================

app.get("/", (req, res) => {

  res.send(
    "PromptPay Server is running"
  );

});


// =====================================================
// สร้าง Payment
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
        amount <= 0
      ) {

        return res.status(400).json({

          error:
            "Invalid amount"

        });

      }


      // ตรวจ Secret Key

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
      // สร้าง Omise Charge
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
      // จำรายการ
      // =================================================

      currentPayment = {

        chargeId:
          data.id,

        amount:
          amount,

        status:
          data.status,

        paid:
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
      // ส่งข้อมูลให้ ESP32
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
// ตรวจสถานะ
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
        currentPayment.paid

    });

  }

);


// =====================================================
// WEBHOOK
// =====================================================

app.post(
  "/webhook",
  (req, res) => {

    console.log(
      "================================"
    );

    console.log(
      "WEBHOOK RECEIVED"
    );

    console.log(
      JSON.stringify(
        req.body,
        null,
        2
      )
    );


    const event =
      req.body;


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


      const amount =
        Number(
          charge.amount
        ) / 100;


      const status =
        charge.status;


      console.log(
        "CHARGE:",
        charge.id
      );


      console.log(
        "AMOUNT:",
        amount
      );


      console.log(
        "STATUS:",
        status
      );


      // =================================================
      // ตรวจรายการ
      // =================================================

      if (

        charge.id ===
        currentPayment.chargeId

        &&

        amount ===
        currentPayment.amount

        &&

        status ===
        "successful"

      ) {

        currentPayment.status =
          "successful";


        currentPayment.paid =
          true;


        console.log(
          "PAYMENT SUCCESS!"
        );

      }

    }


    res
      .status(200)
      .send("OK");

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
      `Server running on ${PORT}`
    );

  }

);
