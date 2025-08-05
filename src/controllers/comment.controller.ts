import { Request, Response } from 'express';
import driver from '../neo4j';
import { commentBlogInput, deleteCommentInput, replyCommentInput, retrieveCommentsInput, } from '../types';
import zod from 'zod';


export const commentBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {

        const parsedPayload = commentBlogInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input.." })
        }

        const userId = req.user && req.user.userId;

        const { blogId, commentText } = parsedPayload.data;

        try {

            const createCommentQuery =
                `
                MATCH (u:User) , (b:Blog)
                WHERE elementId(u) = $userId AND elementId(b) = $blogId
                CREATE (c:Comment {text:$commentText , createdAt:datetime()})
                CREATE (u)-[:WROTE]->(c)
                CREATE (c)-[:ON]->(b)
                SET b.comments = coalesce(b.comments,0) + 1
                RETURN c
            `

            const result = await session.run(createCommentQuery, { userId, blogId, commentText });

            console.log("result", result)

            const nodesCreated = result.summary.counters.updates().nodesCreated;

            console.log("nodes created", nodesCreated)

            const relationshipsCreated = result.summary.counters.updates().relationshipsCreated;

            console.log("relationships created", relationshipsCreated);

            if (nodesCreated > 0 && relationshipsCreated > 0) {
                const userResult = await session.run(
                    `
                        MATCH (u:User)
                        WHERE elementId(u) = $userId
                        RETURN u
                    `, { userId }
                )

                const user = { "user": userResult.records[0].get('u').properties, "userId": userId };

                const blogResult = await session.run(
                    `
                        MATCH (b:Blog)
                        WHERE elementId(b) = $blogId
                        RETURN b
                    `, { blogId }
                )

                const blog = { "blog": blogResult.records[0].get('b').properties, "blogId": blogId };


                const commentResult = await session.run(
                    `
                        MATCH (u:User) , (b:Blog)
                        WHERE elementId(u) =  $userId AND elementId(b)=$blogId
                        MATCH (u)-[:WROTE]->(c)-[:ON]->(b)
                        RETURN c
                    `, { userId, blogId }
                )

                let comments: Array<Object> = []

                console.log("comment Array", commentResult)

                commentResult?.records.map((cmt) => {
                    comments?.push({ "text": cmt.get('c')?.properties?.text, "createdAt": cmt.get('c')?.properties.createdAt?.toStandardDate()?.toISOString() });
                    return comments;
                })

                return res.status(200).json({ msg: "comment added successfully...", user, blog, comments });
            } else {
                return res.status(409).json({ msg: "comment could not be added successfully..." })
            }

        } catch (err) {
            console.error(err);
            return { success: false, message: err };
        }

        // const createComment = await session.run()
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error.." });
    } finally {
        session.close();
    }
}

export const deleteComment = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {
        const parsedPayload = deleteCommentInput.safeParse(req.params.commentId);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input.." })
        }

        const commentId = parsedPayload.data;

        // const blogId = parsedPayload.data;

        // const userId = req.user && req.user.userId;
        try {

            const deleteCommentQuery =
                `
                MATCH (c:Comment)
                WHERE elementId(c) = $commentId
                SET b.comments = b.comments - 1
                DETACH DELETE c
               
            `

            const result = await session.run(deleteCommentQuery, { commentId });

            const deleted = result.summary.counters.updates().relationshipsDeleted;

            const response = result.summary.counters.updates();

            if (deleted > 0) {
                return res.status(200).json({ msg: "comment deleted successfully.." })
            } else {
                return res.status(409).json({ msg: "comment could not be deleted for some reason...", response })
            }

        } catch (err) {
            console.error(err);
            return { success: false, message: err }
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ msg: "internal server error..." })
    }
}

export const replyToComment = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: "blog-app" });

    try {

        const parsedPayload = replyCommentInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input..." })
        }

        const userId = req.user && req.user.userId;

        const { blogId, parentCommentId, text } = parsedPayload.data;

        try {
            const commentQuery =
                `
                MATCH (u:User) , (b:Blog) , (parent:Comment)
                WHERE elementId(u)=$userId AND elementId(b)=$blogId AND elementId(parent) = $parentCommentId
                CREATE (reply:Comment {text:$text,parentCommentId:$parentCommentId,createdAt:datetime()})
                CREATE (u)-[:WROTE]->(reply)
                CREATE (reply)-[:ON]->(b)
                CREATE (reply)-[:REPLIED_TO]->(parent)
                SET b.comments = b.comments + 1
                RETURN reply , parent ,  b , u
            `

            const result = await session.run(commentQuery, { userId, blogId, parentCommentId, text });

            const nodesCreated = result?.summary?.counters?.updates()?.nodesCreated;

            const relationshipsCreated = result?.summary?.counters?.updates()?.relationshipsCreated;

            const labelsAdded = result?.summary?.counters?.updates()?.labelsAdded;

            const propertiesSet = result?.summary?.counters?.updates()?.propertiesSet;

            const user = result?.records[0]?.get('u')?.properties;

            const blog = result?.records[0]?.get('b')?.properties;

            if (nodesCreated > 0 && relationshipsCreated === 3 && labelsAdded > 0 && propertiesSet === 3) {

                const reply = { "id": result?.records[0]?.get('reply')?.elementId, "parentCommentId": result?.records[0]?.get('reply')?.properties?.parentCommentId, "replyText": result?.records[0]?.get('reply')?.properties?.text, "createdAt": result?.records[0]?.get('reply')?.properties?.createdAt?.toStandardDate()?.toISOString(), "user": user, "blog": blog }

                return res.status(200).json({ message: "reply created successfully..", reply })
            }

        } catch (err) {
            console.error(err);
            return { success: false, error: err }
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error...." })
    } finally {
        session.close();
    }
}

// retrieve all comments of all depth  
// we want all the comments on a blog, 
export const getAllComments = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {
        const parsedPayload = retrieveCommentsInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid inuput..." })
        }

        const { blogId } = parsedPayload.data;

        console.log("blogId", blogId)

        try {
            const retrieveCommentsQuery =
                `
                MATCH (b:Blog)<-[:ON]-(root:Comment)<-[:WROTE]-(u:User)
                WHERE elementId(b)=$blogId AND NOT (root)-[:REPLIED_TO]->(:Comment) 
                OPTIONAL MATCH path = (root)<-[:REPLIED_TO*0..]-(reply)<-[:WROTE]-(user)
                WITH reply , user , length(path) AS depth, 
                    CASE WHEN reply = root THEN NULL ELSE nodes(path)[1] END AS parent
                RETURN  reply, parent , user , depth
                ORDER BY depth ASC , reply.createdAt ASC 
            `

            const result = await session.run(retrieveCommentsQuery, { blogId })

            // map returns an array
            const flatComments = result.records.map(record => {
                const replyNode = record.get('reply');
                const userNode = record.get('user');
                const parentNode = record.get('parent');
                const depth = record.get('depth');

                /*  console.log("replyNode",replyNode.elementId);
                 console.log("parentNode",parentNode.elementId) */

                return {

                    "id": replyNode.elementId,
                    "text": replyNode.properties.text,
                    "createdAt": replyNode.properties.createdAt.toStandardDate().toISOString(),
                    "author": {
                        "username": userNode.properties.username
                    },
                    "parentCommentId": parentNode ? parentNode.elementId : null,
                    "blogId": blogId,
                    "depth": depth.toNumber(),
                    "replies": [] as any[] //placeholder for nesting, "as any []" is just another of assigning types , here in this case it would mean that replies array can hold any type of data as elements 
                }
            })

            // comment tree
            const commentMap = new Map<string, any>();
            const rootComments: any[] = [];

            for (const comment of flatComments) {
                commentMap.set(comment.id, comment)
            }

            console.log("commentMap", commentMap);

            for (const comment of flatComments) {

                if (comment.parentCommentId) {

                    const parent = commentMap.get(comment.parentCommentId)

                    console.log("parent", parent);

                    if (parent.parentCommentId !== comment.id) {
                        parent.replies.push(comment);
                    }
                } else {
                    rootComments.push(comment);
                }
            }

            /* console.log("commentMap",commentMap);
            console.log("rootComments",rootComments) */

            console.log("commentMap", commentMap);

            //  note : a Map cannot be converted to json as it is an object with internal structure not a plain serializable object , so basically you can't send it directly to the frontend as it will be converted to an empty object {} 

            const serializedMap = Object.fromEntries(commentMap)

            return res.status(200).json({ msg: "comments retrieved successfully", "comments": serializedMap, "rootComments": rootComments });
        } catch (err) {
            console.error(err);
            return { success: false, error: err }
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error..." })
    } finally {
        // close the session
        session.close();
    }
};