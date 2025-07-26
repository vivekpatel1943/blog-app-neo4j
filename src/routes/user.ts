import express,{Router,Request,Response} from 'express';
import { signup,getAllUsers,signin,addBlog,profile, updateBlog, deleteBlog, getAllBlogs, likeBlog, bookmarkBlog, commentBlog, deleteComment} from '../controllers/user';
import userAuthMiddleware from '../middlewares/user';
import cookieParser from 'cookie-parser';


const router = Router();

// middlewares
router.use(express.json());
router.use(cookieParser());

router.post('/signup',signup);
// this route is to get all the registered users
router.get('/getAllUsers',getAllUsers);
router.get('/getAllBlogs',getAllBlogs)
router.post('/signin',signin);
router.post('/addBlog',userAuthMiddleware,addBlog)
router.get('/profile',userAuthMiddleware,profile);
router.patch('/update-blog/:id',userAuthMiddleware,updateBlog);
router.delete('/delete-blog/:id',userAuthMiddleware,deleteBlog);
router.post('/like-blog/:id',userAuthMiddleware,likeBlog)
router.post('/bookmark-blog/:id',userAuthMiddleware,bookmarkBlog)
router.post('/comment-blog',userAuthMiddleware,commentBlog)
router.delete('/delete-comment/:commentId',userAuthMiddleware,deleteComment);

export default router;