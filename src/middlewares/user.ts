import express, {Request,Response,NextFunction } from 'express';
import jwt,{ JwtPayload } from 'jsonwebtoken';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

const app = express();

// configuring the environment variables
dotenv.config();


// middlewares
app.use(express.json());
app.use(cookieParser())

declare global {
    namespace Express {
        interface Request {
            user? : JwtPayload
        }
    }
}

const userAuthMiddleware = async (req:Request,res:Response,next:NextFunction) => {

    // console.log("req.cookies",req.cookies);

    const token = req.cookies.token;

    if(!token){
        return res.status(400).json({msg:"access denied... token not provided..."})
    }

    try{
        // jwt.verify helps us to verify that the token being has not been expired and has not been tampered with 
        const verifyJwt = (token:string,secret:string): Promise<JwtPayload> => {
            return new Promise((resolve,reject) => {
                jwt.verify(token,secret,(err,data) => {
                    if(err) return reject(err);
                    resolve(data as JwtPayload);
                })
            })
        }

        if(!process.env.jwt_secret){
            throw new Error("jwt_secret not available as environment variables..")
        }

        const isVerified = await verifyJwt(token,process.env.jwt_secret)

        if(!isVerified){
            return res.status(400).json("invalid token...")
        }

        req.user = isVerified;

        next();
    }catch(err){
        console.error("error",err)
    }

}

export default userAuthMiddleware;