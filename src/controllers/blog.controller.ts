import { Request, Response } from 'express';
import driver from '../neo4j';
import {  blogPostInput } from '../types';

import zod from 'zod';


export const getAllBlogs = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {
        const results = await session.run(`MATCH (b:Blog) RETURN  b`);

        const blogs = results.records.map((item) => {
            const blog = item.get('b').properties;
            const elementId = item.get('b').elementId;

            return { blog, elementId };
        })

        console.log("blogs", blogs)

        res.status(200).json({ msg: "all the blogs have been retrieved", blogs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "internal server error..." });
    } finally {
        session.close();
    }

}

export const addBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' })

    try {

        const parsedPayload = blogPostInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input.." })
        }

        const { title, description } = parsedPayload.data;
        //  'CREATE (u:User {username:$username,email:$email,password:$hashedPassword}) RETURN u',
        const subtitle = parsedPayload.data.subtitle ?? null;

        const blog = await session.run('CREATE (b:Blog  {title:$title,subtitle:$subtitle,description:$description,createdAt:datetime(),likes:0,bookmarks:0,comments:0}) RETURN b', { title, subtitle, description })

        // console.log("blog",blog.records[0].get('b'));

        if (!req.user) {
            throw new Error("request object does not have any user object..")
        }

        const email = req.user.email;

        const user = await session.run('MATCH (u:User {email : $email}) RETURN u', { email })

        if (!user.records[0].get('u') || !blog.records[0].get('b')) {
            throw new Error("either blog or user do not exist...")
        }

        const userNode = user.records[0].get('u');
        const blogNode = blog.records[0].get('b');

        const userId = userNode.elementId;
        const blogId = blogNode.elementId;

        /* console.log("userNode",userNode);
        console.log("blogNode",blogNode) */

        console.log("userId", userId);
        console.log("blogId", blogId);

        await session.run(
            `MATCH (u:User), (b:Blog) 
            WHERE elementId(u) = $userId AND elementId(b) = $blogId 
            CREATE (u)-[p:posted]->(b) `,
            { userId, blogId }
        );

       /*  const likeCountQuery = 
        `
            MATCH (u:User)-[l:Liked]->(b:Blog {id:$blogId})
            RETURN COUNT(l) AS likeCount
        `

        const likeResult = await session.run(likeCountQuery,{blogId})

        const likes = likeResult.records[0].get('likeCount').toNumber()

        const bookmarkCountQuery = 
        `
            AWAIT (u:User)-[b:bookmarked]->(b:Blog {id:$blogId})
            RETURN COUNT(b) AS bookmarkCount
        `

        const bookmarkResult = await session.run(bookmarkCountQuery,{blogId})

        const bookmarks = bookmarkResult.records[0].get('bookmarkCount').toNumber();

        const commentCountQuery = 
        `
            AWAIT (u:User)-[w:WROTE]->(b:Blog {id:$blogId})
            RETURN COUNT(w) AS commentCount
        `

        const commentResult = await session.run(commentCountQuery,{blogId});

        const comments = commentResult.records[0].get('commentCount').toNumber()

        const addIntQuery = 
        `

        ` */

        return res.status(200).json({ msg: "blog has been created.." })

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "internal server error..." })
    } finally {
        session.close();
    }
}
