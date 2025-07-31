package org.acme;

import com.fasterxml.jackson.annotation.JsonProperty;

public class HashResponse {

    @JsonProperty("filename")
    public String filename;

    @JsonProperty("letter_count")
    public String letterCount;

    @JsonProperty("word_count")
    public String wordCount;

    @JsonProperty("sha256")
    public String sha256;

    public HashResponse() {
    }

    public HashResponse(String filename, String letterCount, String wordCount, String sha256) {
        this.filename = filename;
        this.letterCount = letterCount;
        this.wordCount = wordCount;
        this.sha256 = sha256;
    }
}