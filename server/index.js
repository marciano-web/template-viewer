import 'dotenv/config';import express from 'express';const app=express();app.get('/api/health',(r,s)=>s.json({ok:true}));app.use(express.static('../web'));app.listen(process.env.PORT||3000);
