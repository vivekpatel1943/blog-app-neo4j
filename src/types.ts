import zod, { optional } from 'zod';

const minLengthErrorMessage = "password should at least be 8 characters long.."
const maxLengthErrorMessage = "password cannot be more than 20 characters long.."
const upperCaseErrorMessage = "please include atleast one uppercase letter in your password"
const lowerCaseErrorMessage = "please include atleast one lowercase letter in your password"
const numberErrorMessage = "please include atleast one number in your password";
const specialCharacterErrorMessage = "please include at-least one special character in your password";


export const passwordSchema =  zod.string({message:"required"}).min(8,{message:minLengthErrorMessage}).max(20,{message:maxLengthErrorMessage}).refine((password) => /[A-Z]/.test(password),{message:upperCaseErrorMessage}).refine((password) => /[a-z]/.test(password),{message:lowerCaseErrorMessage}).refine((password) => /[0-9]/.test(password),{message:numberErrorMessage}).refine((password) => /[!@#$%^&*]/.test(password),{message:specialCharacterErrorMessage})

export const signupInput = zod.object({
  username : zod.string({message:"required"}).min(5,{message:"username should atleast be 5 characters long.."}),
  email :zod.string().email(),
  password : passwordSchema,
})

export const signinInput = zod.object({
  email : zod.string().email(),
  password : zod.string()
}) 


export const blogPostInput = zod.object({
  title : zod.string({message:'Title is Required'}),
  subtitle : zod.string().optional(),
  description : zod.string({message:'Title is Required'}),
  createdAt : zod.date().default(() => new Date()),
  updatedAtHistory : zod.array(zod.date()).default([]), 
}) 


export const updateBlogIdInput = zod.string({message:"Required"})

export const updateBlogPayloadInput = zod.object({
  title : zod.string().optional(),
  subtitle : zod.string().optional(),
  description : zod.string().optional()
})

export const deleteBlogInput = zod.string({message:"Required"});

export const likeBlogInput = zod.string({message:"Required"});

export const bookmarkBlogInput = zod.string({message:"Required"});

export const commentBlogInput = zod.object({
  // id of the blog you want to make the comment to;
  blogId : zod.string({message:"Required"}),
  commentText : zod.string({message:"Required"}),
})

/* const deleteCommentInput = zod.object({
  blogId : zod.string({message:"Required"}),
  commentId : zod.string({message:"Required"})
})  */

export const deleteCommentInput = zod.string().nonempty("Required");
