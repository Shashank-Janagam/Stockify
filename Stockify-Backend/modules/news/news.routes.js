import express from "express";

const router = express.Router();
const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || "http://127.0.0.1:5001/api/news";

router.use("/", async (req, res) => {
  try {
    const path = req.path === "/" ? "" : req.path;
    const url = `${PYTHON_SERVER_URL}${path}`;
    const queryStr = new URLSearchParams(req.query).toString();
    const finalUrl = queryStr ? `${url}?${queryStr}` : url;
    
    const headers = { ...req.headers };
    delete headers.host; // Remove host to avoid conflicts
    
    const options = {
      method: req.method,
      headers
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = JSON.stringify(req.body);
    }
    
    const response = await fetch(finalUrl, options);
    
    // Copy response headers
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }
    
    // Stream the response back to the client
    res.status(response.status);
    
    const text = await response.text();
    res.send(text);
  } catch (err) {
    console.error("Proxy error to Python News Server:", err);
    res.status(500).json({ error: "Failed to connect to News Analysis server", details: err.message });
  }
});

export default router;
