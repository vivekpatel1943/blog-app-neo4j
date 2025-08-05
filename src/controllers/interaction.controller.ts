import { Request, Response } from 'express';
import driver from '../neo4j';
import { signupInput, signinInput, blogPostInput, updateBlogIdInput, updateBlogPayloadInput, deleteBlogInput, likeBlogInput, bookmarkBlogInput, commentBlogInput, deleteCommentInput, replyCommentInput, retrieveCommentsInput, followUserInput } from '../types';
import zod from 'zod';


/* export const addDate = async (req:Request,res:Response):Promise<any> => {

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
} */

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
