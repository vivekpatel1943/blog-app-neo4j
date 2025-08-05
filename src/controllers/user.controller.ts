import { Request, Response } from 'express';
import driver from '../neo4j';
import zod from 'zod';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';


// all the signed-up user
export const getAllUsers = async (req: Request, res: Response): Promise<any> => {
    const session = driver.session({
        database: 'blog-app'
    });

    try {

        const users = await session.run(
            `MATCH (u:User)
            OPTIONAL MATCH (u)-[r]-(n) 
            RETURN u, collect({rel:r,node:n}) AS relationships`
        )

        // console.log("users",users.records)
        const user = users.records.map((record) => {
            const user = record.get('u').properties;
            const userId = record.get('u').elementId;
            const userInfo = { user, userId }
            console.log("user", user);
            console.log("relationships", record.get('relationships'))
            const relationships = record.get('relationships').map((item: any) => ({

                relationshipType: item.rel ? item.rel.type : null,
                relationshipProperties: item.rel ? item.rel.properties : null,
                relationshipId: item.rel ? item.rel.elementId : null,
                connectedNodeLabels: item.node ? item.node.labels : null,
                connectedNodeProperties: item.node ? item.node.properties : null,
                elementId: item.node ? item.node.elementId : null
            }))

            return { userInfo, relationships }
        });

        return res.status(200).json({ msg: "user retrieved successfully..", user });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "internal server error...." })
    } finally {
        session.close()
    }
}

export const profile = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {

        if (!req.user) {
            throw new Error("req object does not contain any user object...")
        }

        const email = req.user.email;
        // so the goal is basically to get the profile of the signed-in user with all his blogs and everything
        const result = await session.run(`MATCH (u:User {email:$email})-[r]-(n) 
            RETURN u , collect(r) AS relationships, collect(n) AS relatedNodes `, { email });

        const title = 'Internet';
        const blogs = await session.run('MATCH (b:Blog {title:$title}) return b', { title })

        console.log("blogs", blogs.records)

        // console.log("user",user)

        // const parsedUser = user.records[0].get('u');

        console.log("result", result.records)

        return res.status(200).json({ msg: "profile retrieved successfully..", result });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error..." });
    } finally {
        session.close()
    }
}