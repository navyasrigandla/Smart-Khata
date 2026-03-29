async function login(role) {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/login",{
        method:"POST",
        headers:{
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username,password,role})
    });
    const data = await res.json();

    if(data.success){
        alert("Login successful");
    }else{
        alert("Invalid Credentials");
    }
}
