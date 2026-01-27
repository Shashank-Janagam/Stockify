import express from "express";
import { getDb } from "../../db/mongo.js";
import requireAuth from "../../Middleware/requireAuth.js";
const router = express.Router();

router.post("/hit", requireAuth,async (req, res) => {
  const { symbol ,name} = req.body;
  const userId=req.user.uid


  if (!symbol || !name) return res.sendStatus(400);


  const db = getDb();
  const stocks = db.collection("stocks");
  const users=db.collection("users")

  await stocks.updateOne(
    { symbol },
    { $inc: { popularity: 1 } }
  );
console.log("updating users reccent ")
/* =========================
     2️⃣ REMOVE DUPLICATE (KEY FIX)
  ========================= */
  await users.updateOne(
    { _id: userId },
    {
      $pull: {
        recentlyViewed: { symbol }
      }
    }
  );

  /* =========================
     3️⃣ PUSH TO TOP (MAX 8)
  ========================= */
  await users.updateOne(
    { _id: userId },
    {
      $push: {
        recentlyViewed: {
          $each: [
            {
              symbol,
              name,
              viewedAt: new Date()
            }
          ],
          $position: 0,
          $slice: 8
        }
      }
    },
    { upsert: true }
  );


  res.sendStatus(200);
});


router.get("/recent", requireAuth, async (req, res) => {
  const db = getDb();
  const users = db.collection("users");

  const user = await users.findOne(
    { _id: req.user.uid },
    { projection: { recentlyViewed: 1 } }
  );

  res.json(user?.recentlyViewed ?? []);
});


export default router;
