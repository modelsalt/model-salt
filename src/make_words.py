# Embeds the public-domain Webster's 2nd (1934) word list from macOS as a JS module
import sys, json
block = {"nigger","nigga","faggot","fag","kike","spic","chink","wop","dago","gook","coon","darky","darkey","negress","slut","whore","cunt","rape","rapist","raping","lynch","lynching","jew","jewing","gypsy","gyp","retard"}
words = sorted({w.strip() for w in open("/usr/share/dict/words") if w.strip().isalpha() and w.strip().islower() and 4 <= len(w.strip()) <= 12 and w.strip() not in block})
open(sys.argv[1], "w").write("// Webster's 2nd International (1934, public domain), lowercase words of 4-12 letters\nexport default " + json.dumps("\n".join(words)) + ".split('\\n');\n")
print(len(words))
