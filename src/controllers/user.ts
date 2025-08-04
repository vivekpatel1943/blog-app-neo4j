import { Request, Response } from 'express';
import driver from '../neo4j';
import { signupInput, signinInput, blogPostInput, updateBlogIdInput, updateBlogPayloadInput, deleteBlogInput, likeBlogInput, bookmarkBlogInput, commentBlogInput, deleteCommentInput, replyCommentInput, retrieveCommentsInput, followUserInput } from '../types';
import bcrypt from 'bcryptjs';
import zod from 'zod';
import jwt, { SignOptions } from 'jsonwebtoken';
import { _null } from 'zod/v4/core/api.cjs';


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

export const addDate = async (req:Request,res:Response):Promise<any> => {

    const session = driver.session({database : 'blog-app'});

    try{
        const addDateQuery = 
        `
            MATCH (b:Blog)
            SET 
                b.createdAt = coalesce(b.createdAt,datetime()),
                b.likes = coalesce(b.likes , 0),
                b.bookmarks = coalesce(b.bookmarks , 0),
                b.comments = coalesce(b.comments , 0)
            RETURN COUNT(b) AS updatedCount
        `

        const addDateResult = await session.run(addDateQuery);

        // console.log("addDateResult",addDateResult);

        const count = addDateResult?.records[0]?.get('updatedCount')?.toNumber();

        return res.status(500).json({msg:`updated ${count}, blog nodes updated with timestamps..`});

    }catch(err){
        console.error(err);
        res.status(500).json({msg:"internal server error..."});
    }
}

export const updateBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {
        const parsedBlogId = updateBlogIdInput.safeParse(req.params.id);
        const parsedPayloadBlog = updateBlogPayloadInput.safeParse(req.body);

        if (!parsedBlogId.success) {
            return res.status(400).json({ msg: "invalid id for the blog" });
        }

        if (!parsedPayloadBlog.success) {
            return res.status(400).json({ msg: "invalid blog payload.." })
        }

        const blogId = parsedBlogId.data;

        console.log("blogId", blogId);
        const { title, subtitle, description } = parsedPayloadBlog.data;

        const result = await session.run(`
            MATCH (b:Blog)
            WHERE elementId(b) = $blogId
            RETURN b
        `, { blogId })

        // console.log("blog",result )

        const existingBlog = result.records[0].get('b').properties;


        const updatedBlog = await session.run(`
                MATCH (b:Blog)  
                WHERE elementId(b) = $blogId
                SET b.title = $title,
                    b.subtitle = $subtitle,
                    b.description = $description,
                    b.updatedAt = datetime(), //latest update
                    b.updateHostory = coalesce(b.updateHistory,[]) + datetime() //append to history
                RETURN b
            `, { blogId, title: title ?? existingBlog.title, subtitle: subtitle ?? existingBlog.subtitle, description: description ?? existingBlog.description });

        console.log("updated blog", updatedBlog);

        return res.status(200).json({ msg: "blog has been updated successfully..", updatedBlog });

        // return res.status(200).json({msg:"blog has been updated successfully..", existingBlog});

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error..." })
    } finally {
        session.close();
    }
}

// in case of deleting a blog we just want to delete the blog-node and the relationships coming to or going out from it and not the nodes that it is related to, 
export const deleteBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {

        const parsedPayload = deleteBlogInput.safeParse(req.params.id);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input" });
        }

        const blogId = parsedPayload.data;

        const blog = await session.run(`
            MATCH(b:Blog)
            WHERE elementId(b) = $blogId
            RETURN b
            `, { blogId })

        if (!blog) {
            return res.status(404).json({ msg: "blog with the given id not found.." })
        }
        console.log("blog", blog);
        const result = await session.run(`
            MATCH (b:Blog)
            WHERE elementId(b) = $blogId
            DETACH DELETE b
            `, { blogId })

        return res.status(200).json({ msg: "blog has been successfully deleted...", result });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error.." });
    } finally {
        session.close();
    }
}

// well this is simple , you simply have to create a relationship between the signed-in user and the blog with the id the user will provide,
export const likeBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: "blog-app" });

    try {

        const parsedPayload = likeBlogInput.safeParse(req.params.id);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input.." })
        }

        // no need for destructuring as blogId is not being sent in the form of javascipt object
        const blogId = parsedPayload.data;

        const userId = req.user && req.user.userId;

        console.log("blogId", blogId)

        // nodes are always kept inside parentheses

        // console.log("result",result);

        try {

            // if the relationship between the user and the blog exists the query shall return true else false
            const isRelQuery = `
                MATCH (u:User), (b:Blog)
                WHERE elementId(u)=$userId AND elementId(b) = $blogId
                MATCH (u:User)-[l:Liked]->(b:Blog)
                RETURN COUNT(l) > 0 AS relationshipExists
            `;

            // this variable is being used to keep track of the number of likes 
            const likeCountQuery = `
                MATCH (u:User)-[l:Liked]->(b:Blog {id : $blogId})
                RETURN COUNT(l) AS likeCount
            `

            const result = await session.run(likeCountQuery, { blogId });

            console.log("result", result);

            let likeCount = result.records[0].get('likeCount').toNumber();

            console.log("likeCount", likeCount);

            const isRel = await session.run(isRelQuery, { userId, blogId });

            console.log("isRel", isRel)

            const exists = isRel.records[0].get('relationshipExists')

            console.log("exists", exists);

            if (!exists) {

                const createRelQuery = `
                    MATCH (u:User) , (b:Blog)
                    WHERE elementId(u) = $userId AND elementId(b) = $blogId
                    CREATE (u)-[l:Liked]->(b)
                    SET b.likes = coalesce(b.likes,0) + 1 
                `
                const result = await session.run(createRelQuery, { userId, blogId });

                const created = result?.summary?.counters?.updates()?.relationshipsCreated;

                if (created > 0) {
                    likeCount = likeCount + 1;
                    console.log("likeCount", 1)
                    return res.status(200).json({ msg: "blog liked successfully..", result, likeCount })
                }
            } else {

                const deleteRelQuery = `
                    MATCH (u:User) , (b:Blog)
                    WHERE elementId(u) = $userId AND elementId(b) = $blogId
                    MATCH (u:User)-[l:Liked]->(b:Blog)
                    DELETE l
                    SET b.likes = b.likes - 1
                `
                const result = await session.run(deleteRelQuery, { userId, blogId });

                console.log("result", result);

                const deleted = result?.summary?.counters?.updates()?.relationshipsDeleted;

                console.log("deleted", deleted);

                if (deleted > 0) {
                    likeCount = likeCount - 1;
                    console.log("likeCount", 1)
                    return res.status(200).json({ msg: "blog unliked successfully...", result, likeCount })
                }
            }

        } catch (err: any) {
            console.error(err);
            return { success: false, error: err.message };
        }

        // res.status(200).json({msg:"liked",result})

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error..." })
    } finally {
        session.close();
    }
}

export const bookmarkBlog = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: "blog-app" });

    try {

        const parsedPayload = bookmarkBlogInput.safeParse(req.params.id);

        if (!parsedPayload.success) {
            return res.status(400).json({ msg: "invalid input.." })
        }

        // no need for destructuring as blogId is not being sent in the form of javascipt object
        const blogId = parsedPayload.data;

        const userId = req.user && req.user.userId;

        console.log("blogId", blogId)

        // nodes are always kept inside parentheses

        // console.log("result",result);

        try {

            // if the relationship between the user and the blog exists the query shall return true else false
            const isRelQuery = `
                MATCH (u:User), (b:Blog)
                WHERE elementId(u)=$userId AND elementId(b) = $blogId
                MATCH (u:User)-[bm:bookmarked]->(b:Blog)
                RETURN COUNT(bm) > 0 AS relationshipExists
            `;

            const isRel = await session.run(isRelQuery, { userId, blogId });

            console.log("isRel", isRel)

            const exists = isRel.records[0].get('relationshipExists')

            console.log("exists", exists);

            if (!exists) {

                const createRelQuery = `
                    MATCH (u:User) , (b:Blog)
                    WHERE elementId(u) = $userId AND elementId(b) = $blogId
                    CREATE (u)-[bm:bookmarked]->(b)
                    SET b.bookmarks = coalesce(b.bookmarks,0) + 1
                `
                const result = await session.run(createRelQuery, { userId, blogId });

                const created = result.summary.counters.updates().relationshipsCreated;

                if (created > 0) {
                    return res.status(200).json({ msg: "blog added to bookmarks successfully..", result })
                }
            } else {

                const deleteRelQuery = `
                    MATCH (u:User) , (b:Blog)
                    WHERE elementId(u) = $userId AND elementId(b) = $blogId
                    MATCH (u:User)-[bm:bookmarked]->(b:Blog)
                    DELETE bm
                    SET b.bookmarks = b.bookmarks - 1
                `
                const result = await session.run(deleteRelQuery, { userId, blogId });

                console.log("result", result);

                const deleted = result.summary.counters.updates().relationshipsDeleted;

                console.log("deleted", deleted);

                if (deleted > 0) {
                    return res.status(200).json({ msg: "blog removed from bookmarks successfully...", result })
                }
            }

        } catch (err: any) {
            console.error(err);
            return { success: false, error: err.message };
        }

        // res.status(200).json({msg:"liked",result})

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "internal server error..." })
    } finally {
        session.close();
    }
}


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
                DETACH DELETE c
                SET b.comments = b.comments - 1
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

// toggle between follow and unfollow , if you are following somebody and if you send the follow request again that toggles it to unfollow
export const follow = async (req: Request, res: Response): Promise<any> => {

    const session = driver.session({ database: 'blog-app' });

    try {

        const parsedPayload = followUserInput.safeParse(req.body);

        if (!parsedPayload.success) {
            return res.status(400).json({ message: "invalid input..." });
        }

        const { toFollowId } = parsedPayload.data;

        const userId = req.user && req.user.userId;

        try {

            const isFollowedQuery =
                `
                MATCH (u:User)-[f:FOLLOWING]->(toFollow:User)
                WHERE elementId(u) = $userId AND elementId(toFollow)=$toFollowId
                RETURN COUNT(f) > 0 AS alreadyFollowed 
            `
            const isFollowedResult = await session.run(isFollowedQuery, { userId, toFollowId });

            const isFollowed = isFollowedResult.records[0].get('alreadyFollowed');


            console.log("isFollowed", isFollowed);

            const followQuery =
                `
                MATCH (toFollow:User) , (u:User)
                WHERE elementId(toFollow)=$toFollowId AND elementId(u)=$userId
                CREATE (toFollow)<-[:FOLLOWING]-(u) 
            `

            const unfollowQuery =
                `
                MATCH (unfollow:User)<-[f:FOLLOWING]-(u:User)
                WHERE elementId(unfollow)=$toFollowId AND elementId(u)=$userId
                DELETE f
            `

            const toFollowUserResult = await session.run(`
                MATCH (toFollow:User)
                WHERE elementId(toFollow) = $toFollowId
                RETURN toFollow
            `, { toFollowId })

            const toFollowUser = toFollowUserResult.records[0].get('toFollow').properties;

            // const relationshipsCreated = followResult?.summary?.counters?.updates()?.relationshipsCreated;

            const followedUsername = toFollowUser.username;

            if (isFollowed) {
                const unFollowResult = await session.run(unfollowQuery, { toFollowId, userId });
                const relationshipDeleted = unFollowResult?.summary?.counters?.updates()?.relationshipsDeleted;

                if (relationshipDeleted > 0) {
                    return res.status(200).json({ msg: "you are not following", followedUsername, toFollowId })
                }
            } else {
                const followResult = await session.run(followQuery, { toFollowId, userId })
                const relationshipCreated = followResult?.summary?.counters?.updates()?.relationshipsCreated;

                if (relationshipCreated) {
                    return res.status(200).json({ msg: "you are following", followedUsername, toFollowId })
                }
            }


            console.log("isFollowedResult", isFollowedResult);
            return res.status(200).json({ msg: "isAlreadyFollowed", isFollowedResult });
        } catch (err) {
            console.error(err);
            return { success: false, error: err }
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error" })
    } finally {
        session.close();
    }
};

export const populateTimeline = async (req: Request, res: Response): Promise<any> => {
    const session = driver.session({ database: "blog-app" });

    try {

        const userId = req.user && req.user.userId

        try {
            // retrieve all the latest posts by the user you follow or you have liked/bookmarked/commented upon their posts in the last one month,

            const retrievePostsQuery =
                `
                    //=== PHASE 1 ====
                    MATCH (u:User)
                    WHERE elementId(u) = $userId

                    //Posts by followed users
                    OPTIONAL MATCH (u)-[:FOLLOWING]->(followed:User)-[:posted]->(fp:Blog)   
                    
                    // Posts the user interacted with 
                    OPTIONAL MATCH (u)-[:Liked|WROTE|bookmarked]->(ip:Blog)

                    WITH COLLECT(DISTINCT fp) + COLLECT(DISTINCT ip) AS recentPostsUnsorted
                    UNWIND recentPostsUnsorted AS post
                    WITH DISTINCT post 
                    RETURN post
                    ORDER BY post.createdAt DESC 
                    LIMIT 20

                    UNION 

                    // === PHASE 2 ===
                    MATCH (u:User)
                    WHERE elementId(u) = $userId

                    // posts by followed users
                    OPTIONAL MATCH (u)-[:FOLLOWING]->(f:user)-[:posted]->(p1:Blog)
                    WITH u , f, p1 , 5 as followScore

                    // Likes 
                    OPTIONAL MATCH (u)-[:Liked]->(p2:Blog)
                    WITH u , f, p1, followScore , p2, 2 as likeScore

                    //Comments
                    OPTIONAL MATCH (u)-[:WROTE]->(p3:Blog)
                    WITH u , f, p1, followScore, p2, likeScore,p3 , 3 AS commentScore

                    // bookmarks 
                    OPTIONAL MATCH (u)-[:bookmarked]->(p4:Blog)
                    WITH u , f , p1 , followScore , p2 , likeScore , p3 , commentScore , p4 , 2 AS bookmarkScore
                    
                    WITH 
                        COLLECT (DISTINCT {post:p1, score:followScore}) + 
                        COLLECT (DISTINCT {post:p2, score:likeScore}) + 
                        COLLECT (DISTINCT {post:p3, score:commentScore}) + 
                        COLLECT (DISTINCT {post:p4,score:bookmarkScore}) AS scoredPosts

                    UNWIND scoredPosts AS entry
                    WITH entry.post AS post , entry.score AS score
                    WHERE post IS NOT NULL

                    WITH post , SUM(score) AS totalScore
                    RETURN post 
                    ORDER BY totalScore DESC , post.createdAt DESC
                    LIMIT 20 
                `

            //  this gives you all the users who you follow , 
            const result = await session.run(retrievePostsQuery,{userId});

            console.log(result);

            const posts = result.records.map((post) => {
                post.get('post').properties.createdAt = post.get('post').properties.createdAt.toStandardDate().toISOString()
                return post.get('post').properties;
            })

            return res.status(200).json({ msg: "posts", posts});

        } catch (err) {
            console.error(err);
            return { success: false, error: err };
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "internal server error.." })
    }finally{
        session.close();
    }
}