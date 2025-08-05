import { Request, Response } from 'express';
import driver from '../neo4j';
import { signupInput, signinInput } from '../types';
import jwt,{ SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs'

import zod from 'zod';

export const signup = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({
        database: 'blog-app' //database name
    });

    try {
        const parsedPayload = signupInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input..." })
        }

        const { username, email, password } = parsedPayload.data;

        // 10 is the number of salt rounds , which refers to the rounds of recursive hashing that the password will go through 
        const hashedPassword = await bcrypt.hash(password, 10)

        await session.run(
            'CREATE (u:User {username:$username,email:$email,password:$hashedPassword}) RETURN u',
            { username, email, hashedPassword }
        )

        return res.status(200).json({ msg: "user created successfully.." })

    } catch (err) {
        if (err instanceof zod.ZodError) {
            return res.status(400).json({
                message: 'Validation Error',
                errors: err.flatten().fieldErrors, // this include your custom messages
            })
        }

        console.error(err);
        return res.status(500).json({ msg: "internal server error" });
    } finally {
        session.close();
    }
}

export const signin = async (req: Request, res: Response): Promise<any> => {
    const session = driver.session(
        {
            database: 'blog-app',
        }
    );

    try {
        const parsedPayload = signinInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input..." })
        }

        const { email, password } = parsedPayload.data;

        const user = await session.run('MATCH (u:User {email:$email}) RETURN u', { email });


        if (user.records.length > 0) {

            const userNode = user.records[0].get('u');
            // console.log("usernode",userNode.elementId)

            const userProps = userNode.properties;
            // console.log("userProps",userProps);

            const isMatch = await bcrypt.compare(password, userProps.password);

            if (!isMatch) {
                return res.status(400).json({ msg: "incorrect password..." })
            }

            // function to sign the token 
            const signToken = (payload: string | object | Buffer, secret: string, options: SignOptions): Promise<string> => {
                return new Promise((resolve, reject) => {
                    jwt.sign(payload, secret, options ?? {}, (err, token) => {
                        if (err || !token) return reject(err);
                        resolve(token);
                    })
                })
            }

            if (!process.env.jwt_secret) {
                throw new Error("jwt secret not available in the environment variables...")
            }

            const token = await signToken({ userId: userNode.elementId, email: email }, process.env.jwt_secret, { expiresIn: '1w' })

            console.log("token", token)

            return res.status(200).cookie('token', token, {
                httpOnly: true, //prevents javascript access to cookies, prevents cross-site-scripting(xss)
                secure: process.env.NODE_ENV === 'production', //while in development this stays false
                //while in production this becomes true and it makes sure that cookie is sent over only https
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week in milliseconds 
            }).json({ msg: "user has been logged in succesfully.." })

            // console.log("type of secret",typeof(process.env.jwt_secret));
        } else {
            console.log("user not found");
            res.status(404).json({ msg: "user not found" })
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "internal server error..." })
    }
}
