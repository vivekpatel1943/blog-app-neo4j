import express from 'express';
import driver from './neo4j';
import router from './routes/user';
import cookieParser from 'cookie-parser';

const app = express();

// middlewares
app.use(express.json());
app.use('/api/v1',router);
app.use(cookieParser());


const port = 5003;

app.listen(port, () => {
    console.log("your server is running on port", port, ".");
})
