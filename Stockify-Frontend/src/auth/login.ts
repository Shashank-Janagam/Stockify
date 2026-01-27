import { GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut } from "firebase/auth"
import { fetchSignInMethodsForEmail } from "firebase/auth";
import {auth} from "..//firebase";


export async function loginWithGoogle(){
    const provider=new GoogleAuthProvider();
    await signInWithPopup(auth,provider);
}
export async function checkEmailExists(email:string):Promise<boolean>{
    const methods=await fetchSignInMethodsForEmail(auth,email);
    return methods.length>0

}
export async function loginWithEmail(
    email:string,password:string){
        await signInWithEmailAndPassword(auth,email,password);
    }

export async function signupWithEmail(
  email: string,
  password: string
) {
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function logout(){
    await signOut(auth);
}

